import { NextRequest, NextResponse } from "next/server"
import { checkTicketCode } from "@/services/participant.service"
import { checkTicketRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  const ip = getClientIP(request)
  const { success } = await checkTicketRateLimit.limit(ip)
  if (!success) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

  const { searchParams } = new URL(request.url)
  const ticketCode = searchParams.get("ticketCode")?.trim().toUpperCase()

  if (!ticketCode) {
    return NextResponse.json(
      { success: false, error: "ticketCode query parameter is required" },
      { status: 400, headers: corsHeaders }
    )
  }

  try {
    const participant = await checkTicketCode(ticketCode)

    if (!participant) {
      return NextResponse.json(
        { success: false, error: "Ticket code not found" },
        { status: 404, headers: corsHeaders }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ticketCode: participant.ticketCode,
          participantName: participant.name,
          eventName: participant.event.name,
          eventDate: participant.event.date,
          eventVenue: participant.event.venue,
          numberOfParticipants: participant.numberOfParticipants,
          attended: participant.attended,
          registeredAt: participant.registeredAt,
          competitionNumber: participant.competitionNumber,
          isGroupRegistration: participant.isGroupRegistration,
        },
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("Check ticket error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}
