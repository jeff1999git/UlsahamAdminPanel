import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { participantSchema } from "@/validators/participant.validator"
import { getPublishedEventBySlug } from "@/services/event.service"
import { findParticipantByTicketCodeOnly, updateParticipant } from "@/repositories/participant.repository"
import { registerParticipant, PHONE_ALREADY_REGISTERED } from "@/services/participant.service"
import { z } from "zod"

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\d{10}$/),
  email: z.string().email().optional().nullable().or(z.literal("")),
  age: z.coerce.number().int().min(1).max(120),
  numberOfParticipants: z.coerce.number().int().min(1).max(10),
  /** Present when this payment settles an existing unpaid ticket. */
  ticketCode: z.string().trim().min(1).max(40).optional(),
})

function ticketPayload(
  p: {
    ticketCode: string
    name: string
    numberOfParticipants: number
    competitionNumber: number | null
    isGroupRegistration: boolean
  },
  event: { name: string; date: Date; venue: string; isCompetition: boolean },
  ids: { paymentId: string; orderId: string }
) {
  return {
    ticketCode: p.ticketCode,
    participantName: p.name,
    eventName: event.name,
    eventDate: event.date,
    eventVenue: event.venue,
    numberOfParticipants: p.numberOfParticipants,
    isCompetition: event.isCompetition,
    competitionNumber: p.competitionNumber,
    isGroupRegistration: p.isGroupRegistration,
    paymentId: ids.paymentId,
    orderId: ids.orderId,
  }
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

  const parsed = verifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request data" },
      { status: 400, headers: corsHeaders }
    )
  }

  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "Payment configuration error" },
      { status: 500, headers: corsHeaders }
    )
  }

  // HMAC-SHA256 signature verification
  const sigBody = `${parsed.data.razorpay_order_id}|${parsed.data.razorpay_payment_id}`
  const expected = crypto.createHmac("sha256", secret).update(sigBody).digest("hex")
  if (expected !== parsed.data.razorpay_signature) {
    return NextResponse.json(
      { success: false, error: "Payment verification failed. Please contact support." },
      { status: 400, headers: corsHeaders }
    )
  }

  try {
    const event = await getPublishedEventBySlug(slug)
    if (!event) {
      return NextResponse.json({ success: false, error: "Event not found" }, { status: 404, headers: corsHeaders })
    }

    const { razorpay_payment_id, razorpay_order_id, name, phone, email, age, numberOfParticipants, ticketCode } = parsed.data
    const ids = { paymentId: razorpay_payment_id, orderId: razorpay_order_id }

    // 1) Re-payment: settle the specific unpaid ticket this order was created for.
    if (ticketCode) {
      const existing = await findParticipantByTicketCodeOnly(ticketCode.toUpperCase())
      if (!existing || existing.eventId !== event.id) {
        return NextResponse.json(
          { success: false, error: "Ticket not found. Please contact support with your payment ID." },
          { status: 404, headers: corsHeaders }
        )
      }
      const updated = existing.amountPaid
        ? existing
        : await updateParticipant(existing.id, {
            amountPaid: true,
            paymentId: razorpay_payment_id,
            paymentOrderId: existing.paymentOrderId ?? razorpay_order_id,
          })
      return NextResponse.json(
        { success: true, message: "Payment verified and registration confirmed!", data: ticketPayload(updated, event, ids) },
        { status: 200, headers: corsHeaders }
      )
    }

    // 2) New booking, idempotent on the Razorpay order id: replaying the same
    //    order (client retry, webhook race) returns the booking it created.
    const { participant, isNew } = await registerParticipant({
      eventId: event.id,
      name,
      phone,
      email: email || null,
      age,
      numberOfParticipants,
      amountPaid: true,
      paymentOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    })

    if (!participant.amountPaid) {
      await updateParticipant(participant.id, { amountPaid: true, paymentId: razorpay_payment_id })
    }

    return NextResponse.json(
      { success: true, message: "Payment verified and registration confirmed!", data: ticketPayload(participant, event, ids) },
      { status: isNew ? 201 : 200, headers: corsHeaders }
    )
  } catch (error) {
    console.error("Public payment verify error:", error)
    const msg = error instanceof Error ? error.message : ""
    if (msg === PHONE_ALREADY_REGISTERED) {
      // Legacy per-phone unique index still in the DB — the payment went
      // through but no ticket could be written; surface it loudly.
      return NextResponse.json(
        { success: false, error: "Payment received but this phone number already has a booking on this event. Please contact support with your payment ID." },
        { status: 409, headers: corsHeaders }
      )
    }
    return NextResponse.json(
      { success: false, error: "Registration failed. Please contact support with your payment ID." },
      { status: 500, headers: corsHeaders }
    )
  }
}
