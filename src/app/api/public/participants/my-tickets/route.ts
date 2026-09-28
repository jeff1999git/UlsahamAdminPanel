import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { myTicketsRateLimit, allow, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { findParticipantsByTicketCodes } from "@/repositories/participant.repository"
import { getEffectiveStatus } from "@/lib/event-status"
import { getEffectiveAmount } from "@/lib/pricing"

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
  if (!(await allow(myTicketsRateLimit, ip))) {
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
      enteredCount: p.enteredCount,
      registeredAt: p.registeredAt,
      competitionNumber: p.competitionNumber,
      isGroupRegistration: p.isGroupRegistration,
      // Times and status let the site tell "Not Attended" (after the end
      // time) and "Cancelled" apart; the price fields let it show what an
      // unpaid ticket will cost without loading the event.
      event: {
        id: p.event.id,
        name: p.event.name,
        slug: p.event.slug,
        date: p.event.date,
        startTime: p.event.startTime,
        endTime: p.event.endTime,
        status: getEffectiveStatus(p.event),
        venue: p.event.venue,
        bannerImageUrl: p.event.bannerImageUrl,
        isFree: p.event.isFree,
        amount: p.event.amount,
        earlyBirdAmount: p.event.earlyBirdAmount,
        isEarlyBird: p.event.isEarlyBird,
        effectiveAmount: getEffectiveAmount(p.event),
        groupExtraAmount: p.event.groupExtraAmount,
        gstEnabled: p.event.gstEnabled,
        platformFeeEnabled: p.event.platformFeeEnabled,
        isCompetition: p.event.isCompetition,
        participationType: p.event.participationType,
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
