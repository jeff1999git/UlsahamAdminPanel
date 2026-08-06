import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { myTicketsRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { findParticipantsByTicketCodes } from "@/repositories/participant.repository"

const MAX_CODES = 20

const bodySchema = z.object({
  ticketCodes: z
    .array(z.string().min(1))
    .min(1, "At least one ticket code required")
    .max(MAX_CODES, `Maximum ${MAX_CODES} ticket codes per request`),
})

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  const ip = getClientIP(request)
  const { success: rateLimitOk } = await myTicketsRateLimit.limit(ip)
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    )
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.flatten().fieldErrors.ticketCodes?.[0] ?? "Invalid request" },
      { status: 400, headers: corsHeaders }
    )
  }

  try {
    const participants = await findParticipantsByTicketCodes(parsed.data.ticketCodes)

    const tickets = participants.map((p) => ({
      ticketCode: p.ticketCode,
      participantName: p.name,
      numberOfParticipants: p.numberOfParticipants,
      amountPaid: p.amountPaid,
      attended: p.attended,
      registeredAt: p.registeredAt,
      competitionNumber: p.competitionNumber,
      isGroupRegistration: p.isGroupRegistration,
      event: {
        id: p.event.id,
        name: p.event.name,
        slug: p.event.slug,
        date: p.event.date,
        venue: p.event.venue,
        bannerImageUrl: p.event.bannerImageUrl,
        isCompetition: p.event.isCompetition,
        competitionInstructions: p.event.competitionInstructions,
        competitionNotes: p.event.competitionNotes,
      },
    }))

    return NextResponse.json(
      { success: true, data: { tickets } },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("My tickets error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch tickets" },
      { status: 500, headers: corsHeaders }
    )
  }
}
