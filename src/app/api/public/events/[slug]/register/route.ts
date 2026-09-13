import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { registerRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { participantSchema } from "@/validators/participant.validator"
import { getPublishedEventBySlug, findEventComplimentaryCodes, incrementComplimentaryCodeUsage } from "@/services/event.service"
import { countParticipantsForEvent } from "@/repositories/participant.repository"
import { registerParticipant, PHONE_ALREADY_REGISTERED, EVENT_FULL } from "@/services/participant.service"
import { validateCompetitionQuantity } from "@/lib/competition"

const registerBodySchema = participantSchema.extend({
  code: z.string().max(50).optional(),
})

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  const ip = getClientIP(request)
  const { success: rateLimitOk } = await registerRateLimit.limit(ip)
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

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

  try {
    const event = await getPublishedEventBySlug(slug)

    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404, headers: corsHeaders }
      )
    }

    // Booking runs until the event's end time unless an admin closed it, the
    // event was cancelled, or every seat is taken.
    if (event.bookingClosedReason) {
      return NextResponse.json(
        { success: false, error: event.bookingClosedMessage },
        { status: 410, headers: corsHeaders }
      )
    }

    const quantityError = validateCompetitionQuantity(event, parsed.data.numberOfParticipants)
    if (quantityError) {
      return NextResponse.json(
        { success: false, error: quantityError },
        { status: 400, headers: corsHeaders }
      )
    }

    let complimentaryCode: string | undefined

    if (!event.isFree) {
      if (!parsed.data.code) {
        return NextResponse.json(
          { success: false, error: "This is a paid event — use the payment endpoint" },
          { status: 400, headers: corsHeaders }
        )
      }

      const complimentaryCodes = await findEventComplimentaryCodes(event.id)
      const match = complimentaryCodes.find(
        (c) => c.code.toUpperCase() === parsed.data.code!.toUpperCase()
      )
      if (!match || match.maxUses - match.usedCount <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid or fully-used code" },
          { status: 400, headers: corsHeaders }
        )
      }
      complimentaryCode = match.code
    }

    // A person may hold several bookings for one event — no per-phone block here.

    if (event.capacity !== null) {
      const currentCount = await countParticipantsForEvent(event.id)
      if (currentCount + parsed.data.numberOfParticipants > event.capacity) {
        return NextResponse.json(
          { success: false, error: "Event is full" },
          { status: 410, headers: corsHeaders }
        )
      }
    }

    const { participant } = await registerParticipant({
      eventId: event.id,
      ...parsed.data,
      email: parsed.data.email || null,
      amountPaid: true,
    })

    if (complimentaryCode) {
      await incrementComplimentaryCodeUsage(event.id, complimentaryCode)
    }

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
      { status: 201, headers: corsHeaders }
    )
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
        { success: false, error: "This phone number is already registered for this event" },
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
