import { NextRequest, NextResponse } from "next/server"
import { registerRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { participantSchema } from "@/validators/participant.validator"
import { getPublishedEventBySlug } from "@/services/event.service"
import { countParticipantsForEvent, findParticipantByEventAndPhone } from "@/repositories/participant.repository"
import { registerParticipant } from "@/services/participant.service"

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

  const parsed = participantSchema.safeParse(body)
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

    if (!event.isFree) {
      return NextResponse.json(
        { success: false, error: "This is a paid event — use the payment endpoint" },
        { status: 400, headers: corsHeaders }
      )
    }

    const existingParticipant = await findParticipantByEventAndPhone(event.id, parsed.data.phone)
    if (existingParticipant) {
      return NextResponse.json(
        { success: false, error: "This phone number is already registered for this event" },
        { status: 409, headers: corsHeaders }
      )
    }

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
    })

    return NextResponse.json(
      {
        success: true,
        message: "Registration successful!",
        data: {
          ticketCode: participant.ticketCode,
          qrCodeUrl: participant.qrCodeUrl,
          participantName: participant.name,
          eventName: event.name,
          eventDate: event.date,
          eventVenue: event.venue,
          numberOfParticipants: participant.numberOfParticipants,
          isFree: event.isFree,
        },
      },
      { status: 201, headers: corsHeaders }
    )
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json(
      { success: false, error: "Registration failed. Please try again." },
      { status: 500, headers: corsHeaders }
    )
  }
}
