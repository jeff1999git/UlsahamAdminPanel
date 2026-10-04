import { NextRequest, NextResponse, after } from "next/server"
import crypto from "crypto"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { verifyRateLimit, allow, getClientIP } from "@/lib/ratelimit"
import { chargeFields, fetchOrderBooking, safeHexEqual } from "@/lib/razorpay"
import { ticketPayload } from "@/lib/ticket-payload"
import { logActivity } from "@/lib/activity-logger"
import { duplicatePaymentLog } from "@/lib/duplicate-payment"
import { getBookableEventBySlug } from "@/services/event.service"
import {
  findBookingByOrderId,
  findParticipantByTicketCodeOnly,
  updateParticipant,
} from "@/repositories/participant.repository"
import { registerParticipant, PHONE_ALREADY_REGISTERED, EVENT_NOT_ACCEPTING } from "@/services/participant.service"
import { z } from "zod"

const paymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  /** Present when this payment settles an existing unpaid ticket. */
  ticketCode: z.string().trim().min(1).max(40).optional(),
})

// The site still sends the buyer and the seat count with a new booking. They
// are checked for shape only; the booking is written from the order's notes,
// never from these. A re-payment (ticketCode) settles a ticket that already
// holds its buyer, so there they may be left out.
const buyerSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\d{10}$/),
  email: z.string().email().optional().nullable().or(z.literal("")),
  age: z.coerce.number().int().min(1).max(120),
  numberOfParticipants: z.coerce.number().int().min(1).max(10),
})

function parseVerifyBody(body: unknown) {
  const payment = paymentSchema.safeParse(body)
  if (!payment.success) return null
  if (!payment.data.ticketCode && !buyerSchema.safeParse(body).success) return null
  return payment.data
}

const CONFIRMED = "Payment verified and registration confirmed!"
const REGISTRATION_FAILED = "Registration failed. Please contact support with your payment ID."

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

  const payment = parseVerifyBody(body)
  if (!payment) {
    return NextResponse.json(
      { success: false, error: "Invalid request data" },
      { status: 400, headers: corsHeaders }
    )
  }

  if (!(await allow(verifyRateLimit, getClientIP(request)))) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "Payment configuration error", code: "REGISTRATION_FAILED" },
      { status: 500, headers: corsHeaders }
    )
  }

  // HMAC-SHA256 signature verification
  const { razorpay_payment_id, razorpay_order_id } = payment
  const expected = crypto.createHmac("sha256", secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex")
  if (!safeHexEqual(expected, payment.razorpay_signature)) {
    return NextResponse.json(
      { success: false, error: "Payment verification failed. Please contact support.", code: "SIGNATURE_INVALID" },
      { status: 400, headers: corsHeaders }
    )
  }

  const ids = { paymentId: razorpay_payment_id, orderId: razorpay_order_id }
  const requestedTicket = payment.ticketCode?.toUpperCase() || null

  try {
    // An order that already has its booking (a retried confirmation, or the
    // webhook got there first) is answered from the database alone: no
    // Razorpay call, and whatever the event's status is now.
    const recorded = await findBookingByOrderId(razorpay_order_id)
    if (recorded && recorded.event.slug === slug && (!requestedTicket || recorded.ticketCode === requestedTicket)) {
      const settled = recorded.amountPaid
        ? recorded
        : await updateParticipant(recorded.id, { amountPaid: true, entryType: "PAID", paymentId: razorpay_payment_id })
      return NextResponse.json(
        { success: true, message: CONFIRMED, data: ticketPayload(settled, recorded.event, ids) },
        { status: 200, headers: corsHeaders }
      )
    }

    // The signature proves only that this payment belongs to this order. What
    // the order paid for — the event, the seats, the buyer and any ticket it
    // settles — is read from the notes written when the order was created,
    // never from this request. Otherwise one real payment could be replayed for
    // any event or any number of seats. The event is read at the same time.
    const [orderResult, eventResult] = await Promise.allSettled([
      fetchOrderBooking(razorpay_order_id),
      getBookableEventBySlug(slug),
    ])
    if (orderResult.status === "rejected") {
      console.error("Public payment verify: could not fetch the order", orderResult.reason)
      // The Razorpay webhook completes the booking from the same notes.
      return NextResponse.json(
        {
          success: false,
          error: "We could not confirm your payment yet. If money was taken, your booking will be completed automatically — please check My Bookings shortly.",
          code: "GATEWAY_UNAVAILABLE",
        },
        { status: 502, headers: corsHeaders }
      )
    }
    if (eventResult.status === "rejected") throw eventResult.reason
    const booking = orderResult.value
    const event = eventResult.value

    // Only a buyer whose payment went through gets here, so both answers say
    // what to do next.
    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found. Please contact support with your payment ID.", code: "EVENT_NOT_FOUND" },
        { status: 404, headers: corsHeaders }
      )
    }
    if (event.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: "This event has been cancelled. Please contact support with your payment ID.", code: "EVENT_NOT_FOUND" },
        { status: 404, headers: corsHeaders }
      )
    }

    const settledTicket = booking?.kind === "repay" ? booking.ticketCode : null
    if (!booking || booking.eventId !== event.id || (requestedTicket && requestedTicket !== settledTicket)) {
      return NextResponse.json(
        { success: false, error: "This payment does not match this booking. Please contact support with your payment ID.", code: "ORDER_MISMATCH" },
        { status: 400, headers: corsHeaders }
      )
    }

    // 1) Re-payment: settle the one unpaid ticket this order was created for.
    if (booking.kind === "repay") {
      const existing = await findParticipantByTicketCodeOnly(booking.ticketCode)
      if (!existing || existing.eventId !== event.id) {
        return NextResponse.json(
          { success: false, error: "Ticket not found. Please contact support with your payment ID." },
          { status: 404, headers: corsHeaders }
        )
      }
      let updated = existing
      if (!existing.amountPaid) {
        updated = await updateParticipant(existing.id, {
          amountPaid: true,
          entryType: "PAID",
          paymentId: razorpay_payment_id,
          paymentOrderId: existing.paymentOrderId ?? razorpay_order_id,
          ...chargeFields(booking),
        })
      } else if (existing.paymentId !== razorpay_payment_id) {
        // Paid twice (two tabs, or two orders while it was unpaid): the ticket
        // stands, and the extra payment is logged for staff to refund.
        after(() => logActivity(duplicatePaymentLog("payment-verify", existing, ids)))
      }
      return NextResponse.json(
        { success: true, message: CONFIRMED, data: ticketPayload(updated, event, ids) },
        { status: 200, headers: corsHeaders }
      )
    }

    // 2) New booking, idempotent on the Razorpay order id: replaying the same
    //    order (client retry, webhook race) returns the booking it created.
    const { participant, isNew } = await registerParticipant(
      {
        eventId: event.id,
        name: booking.name,
        phone: booking.phone,
        email: booking.email,
        age: booking.age,
        numberOfParticipants: booking.numberOfParticipants,
        amountPaid: true,
        entryType: "PAID",
        paymentOrderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amountPaidPaise: booking.amountPaise,
      },
      { event }
    )

    if (!participant.amountPaid) {
      await updateParticipant(participant.id, {
        amountPaid: true,
        entryType: "PAID",
        paymentId: razorpay_payment_id,
        ...chargeFields(booking),
      })
    }

    return NextResponse.json(
      { success: true, message: CONFIRMED, data: ticketPayload(participant, event, ids) },
      { status: isNew ? 201 : 200, headers: corsHeaders }
    )
  } catch (error) {
    console.error("Public payment verify error:", error)
    const msg = error instanceof Error ? error.message : ""
    if (msg === PHONE_ALREADY_REGISTERED) {
      // Legacy per-phone unique index still in the DB — the payment went
      // through but no ticket could be written; surface it loudly.
      return NextResponse.json(
        {
          success: false,
          error: "Payment received but this phone number already has a booking on this event. Please contact support with your payment ID.",
          code: "PHONE_ALREADY_REGISTERED",
        },
        { status: 409, headers: corsHeaders }
      )
    }
    if (msg === EVENT_NOT_ACCEPTING) {
      // Booking closed between the order and the payment (or the event ended).
      return NextResponse.json(
        {
          success: false,
          error: "Payment received, but booking for this event has closed, so no ticket was issued. Please contact support with your payment ID.",
          code: "REGISTRATION_FAILED",
        },
        { status: 500, headers: corsHeaders }
      )
    }
    return NextResponse.json(
      { success: false, error: REGISTRATION_FAILED, code: "REGISTRATION_FAILED" },
      { status: 500, headers: corsHeaders }
    )
  }
}
