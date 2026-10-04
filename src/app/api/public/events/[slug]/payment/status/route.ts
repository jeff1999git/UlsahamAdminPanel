import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { paymentStatusRateLimit, allow, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { ticketPayload } from "@/lib/ticket-payload"
import { findTicketEventBySlug } from "@/repositories/event.repository"
import { findParticipantByOrderId } from "@/repositories/participant.repository"

// The site asks here when a payment's verify reply never reached it (the tab
// was closed or reloaded, the UPI app switch lost the page, the network
// dropped): has this order been recorded yet? The webhook usually records it
// within seconds, so the site polls for a while before saying no payment was
// found.
const bodySchema = z.object({
  orderId: z.string().min(1).max(64),
  phone: z.string().regex(/^\d{10}$/),
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

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request data" },
      { status: 400, headers: corsHeaders }
    )
  }

  if (!(await allow(paymentStatusRateLimit, getClientIP(request)))) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

  const { orderId, phone } = parsed.data

  try {
    const [event, booking] = await Promise.all([findTicketEventBySlug(slug), findParticipantByOrderId(orderId)])
    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found", code: "EVENT_NOT_FOUND" },
        { status: 404, headers: corsHeaders }
      )
    }

    // The phone must be the booking's, and a different one is answered exactly
    // like "not recorded yet", so an order id alone never reveals a booking.
    if (!booking || booking.eventId !== event.id || booking.phone !== phone) {
      return NextResponse.json({ success: true, pending: true }, { headers: corsHeaders })
    }

    return NextResponse.json(
      {
        success: true,
        data: ticketPayload(booking, event, { paymentId: booking.paymentId, orderId: booking.paymentOrderId ?? orderId }),
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("Payment status error:", error)
    return NextResponse.json(
      { success: false, error: "Could not check the payment. Please try again." },
      { status: 500, headers: corsHeaders }
    )
  }
}
