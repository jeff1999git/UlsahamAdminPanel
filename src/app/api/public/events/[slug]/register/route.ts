import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { registerRateLimit, registerIpRateLimit, allowBooking, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { participantSchema } from "@/validators/participant.validator"
import { getBookableEventBySlug, incrementComplimentaryCodeUsage, type BookableEvent } from "@/services/event.service"
import { countParticipantsForEvent, findParticipantByEventAndRequestId } from "@/repositories/participant.repository"
import { registerParticipant, PHONE_ALREADY_REGISTERED, EVENT_FULL } from "@/services/participant.service"
import { validateCompetitionQuantity } from "@/lib/competition"
import { warnIfLegacyUniqueIndexes } from "@/lib/index-guard"
import type { Participant } from "@prisma/client"

const registerBodySchema = participantSchema.extend({
  code: z.string().max(50).optional(),
  /** The site's id for this submit: a retry with the same id gets the same booking back. */
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "Invalid request id").optional(),
})

function registrationResponse(
  participant: Participant,
  event: BookableEvent,
  status: number,
  headers: Record<string, string>
) {
  return NextResponse.json(
    {
      success: true,
      message: "Registration successful!",
      data: {
        ticketCode: participant.ticketCode,
        participantName: participant.name,
        eventName: event.name,
        eventDate: event.date,
        eventVenue: event.venue,
        numberOfParticipants: participant.numberOfParticipants,
        isFree: event.isFree,
        isCompetition: event.isCompetition,
        competitionNumber: participant.competitionNumber,
        isGroupRegistration: participant.isGroupRegistration,
      },
    },
    { status, headers }
  )
}

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  const { slug } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    )
  }

  const parsed = registerBodySchema.safeParse(body)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    return NextResponse.json(
      {
        success: false,
        error: "Validation failed",
        fieldErrors,
      },
      { status: 400, headers: corsHeaders }
    )
  }

  const ip = getClientIP(request)
  if (!(await allowBooking({ perPhone: registerRateLimit, perIp: registerIpRateLimit }, ip, parsed.data.phone))) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

  const { code, requestId, ...buyer } = parsed.data

  try {
    const event = await getBookableEventBySlug(slug)

    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found", code: "EVENT_NOT_FOUND" },
        { status: 404, headers: corsHeaders }
      )
    }

    // A retried submit gets the booking it already made, even if booking has
    // closed or the code has run out since.
    if (requestId) {
      const previous = await findParticipantByEventAndRequestId(event.id, requestId, buyer.phone)
      if (previous) return registrationResponse(previous, event, 200, corsHeaders)
    }

    // Booking runs until the event's end time unless an admin closed it, the
    // event was cancelled, or every seat is taken.
    if (event.bookingClosedReason) {
      return NextResponse.json(
        { success: false, error: event.bookingClosedMessage },
        { status: 410, headers: corsHeaders }
      )
    }

    const quantityError = validateCompetitionQuantity(event, buyer.numberOfParticipants)
    if (quantityError) {
      return NextResponse.json(
        { success: false, error: quantityError },
        { status: 400, headers: corsHeaders }
      )
    }

    let complimentaryCode: string | undefined

    if (!event.isFree) {
      if (!code) {
        return NextResponse.json(
          { success: false, error: "This is a paid event — use the payment endpoint" },
          { status: 400, headers: corsHeaders }
        )
      }

      const match = event.complimentaryCodes.find((c) => c.code.toUpperCase() === code.toUpperCase())
      if (!match || match.maxUses - match.usedCount <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid or fully-used code", code: "COUPON_INVALID" },
          { status: 400, headers: corsHeaders }
        )
      }
      complimentaryCode = match.code
    }

    // A person may hold several bookings for one event — no per-phone block here.

    if (event.capacity !== null) {
      const currentCount = await countParticipantsForEvent(event.id)
      if (currentCount + buyer.numberOfParticipants > event.capacity) {
        return NextResponse.json(
          { success: false, error: "Event is full" },
          { status: 410, headers: corsHeaders }
        )
      }
    }

    // Logs loudly while a unique index from an older schema is still in the
    // database; the create below then fails for a repeated phone (409).
    await warnIfLegacyUniqueIndexes()

    const { participant, isNew } = await registerParticipant(
      {
        eventId: event.id,
        ...buyer,
        email: buyer.email || null,
        requestId,
        amountPaid: true,
        // A paid event only reaches this point with a valid complimentary code.
        entryType: complimentaryCode ? "COMPLIMENTARY" : "FREE",
      },
      { event }
    )

    if (complimentaryCode && isNew) {
      await incrementComplimentaryCodeUsage(event.id, complimentaryCode)
    }

    return registrationResponse(participant, event, isNew ? 201 : 200, corsHeaders)
  } catch (error) {
    const msg = error instanceof Error ? error.message : ""
    if (msg === EVENT_FULL) {
      return NextResponse.json(
        { success: false, error: "Event is full" },
        { status: 410, headers: corsHeaders }
      )
    }
    if (msg === PHONE_ALREADY_REGISTERED) {
      return NextResponse.json(
        { success: false, error: "This phone number is already registered for this event", code: "PHONE_ALREADY_REGISTERED" },
        { status: 409, headers: corsHeaders }
      )
    }
    console.error("Registration error:", error)
    return NextResponse.json(
      { success: false, error: "Registration failed. Please try again." },
      { status: 500, headers: corsHeaders }
    )
  }
}
