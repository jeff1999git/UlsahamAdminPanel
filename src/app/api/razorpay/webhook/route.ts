import { NextRequest, NextResponse, after } from "next/server"
import crypto from "crypto"
import {
  findParticipantByEventAndOrderId,
  findParticipantByTicketCodeOnly,
  findPaymentStateByOrderId,
  updateParticipant,
} from "@/repositories/participant.repository"
import { registerParticipant } from "@/services/participant.service"
import { logActivity } from "@/lib/activity-logger"
import { chargeFields, fetchOrderBooking, safeHexEqual } from "@/lib/razorpay"
import { requestTicketMail } from "@/lib/site-ticket-mail"
import { duplicatePaymentLog } from "@/lib/duplicate-payment"

// Razorpay waits about 5 s for an answer and retries a delivery that fails.
// The order fetch gives up after 3 s, so a slow Razorpay ends in a 500 that is
// retried, and the work left for after the response (the activity log and the
// ticket email) still fits in the function's time.
const ORDER_FETCH_TIMEOUT_MS = 3000
export const maxDuration = 15

/**
 * The activity log write and the ticket email for a booking this webhook
 * completed. Both run after the response, so Razorpay is not kept waiting,
 * and neither can change it: logActivity and requestTicketMail never throw.
 */
function afterResponse(log: Parameters<typeof logActivity>[0], ticket?: { ticketCode: string; email: string | null }) {
  after(() => logActivity(log))
  // The browser that would have emailed the ticket never got the booking.
  if (ticket) after(() => requestTicketMail(ticket.ticketCode, ticket.email))
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET not configured")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get("x-razorpay-signature") ?? ""

  // Constant-time comparison to prevent timing attacks
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex")
  if (!safeHexEqual(expected, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventType = body.event as string | undefined
  if (eventType !== "payment.captured") {
    return NextResponse.json({ status: "ignored" })
  }

  try {
    const payment = (body.payload as Record<string, unknown>)?.payment as Record<string, unknown>
    const entity = payment?.entity as Record<string, unknown> | undefined
    const paymentId = entity?.id as string | undefined
    const orderId = entity?.order_id as string | undefined

    if (!orderId) {
      console.error("[Razorpay Webhook] Missing order_id on payment entity")
      return NextResponse.json({ status: "skipped" })
    }

    // Usually payment/verify has recorded and settled the booking already: one
    // indexed read answers, with no Razorpay call.
    const recorded = await findPaymentStateByOrderId(orderId)
    if (recorded?.amountPaid) {
      return NextResponse.json({ status: "ok" })
    }

    // The payment's own notes can be set by the payer at Checkout, so the
    // booking is read from the order, whose notes the server wrote when it
    // created it — the same source payment/verify uses, so both always book the
    // same event and seats. A failed fetch lands in the 500 below and Razorpay
    // retries the delivery.
    const booking = await fetchOrderBooking(orderId, ORDER_FETCH_TIMEOUT_MS)
    if (!booking) {
      console.error("[Razorpay Webhook] Order has no usable booking notes", { orderId })
      // Return 200 so Razorpay doesn't keep retrying an unrecoverable case
      return NextResponse.json({ status: "skipped" })
    }
    const { eventId } = booking

    // 1) Re-payment of an existing unpaid ticket (order carried its ticketCode).
    if (booking.kind === "repay") {
      const ticket = await findParticipantByTicketCodeOnly(booking.ticketCode)
      if (!ticket || ticket.eventId !== eventId) {
        console.error("[Razorpay Webhook] Re-payment ticket not found", { eventId, ticketCode: booking.ticketCode })
        return NextResponse.json({ status: "skipped" })
      }
      if (ticket.amountPaid) {
        // Paid twice (two tabs, or two orders while it was unpaid): the ticket
        // stands, and the extra payment is logged for staff to refund.
        if (paymentId && ticket.paymentId !== paymentId) {
          after(() => logActivity(duplicatePaymentLog("razorpay-webhook", ticket, { paymentId, orderId })))
        }
      } else {
        await updateParticipant(ticket.id, {
          amountPaid: true,
          entryType: "PAID",
          paymentId: paymentId ?? null,
          paymentOrderId: ticket.paymentOrderId ?? orderId,
          ...chargeFields(booking),
        })
        afterResponse(
          {
            adminUsername: "razorpay-webhook",
            adminRole: "SYSTEM",
            action: "PARTICIPANT_UPDATED",
            entity: "Participant",
            entityId: ticket.id,
            description: `Payment confirmed via webhook: ${ticket.name} (${ticket.ticketCode}) — Payment: ${paymentId}`,
            metadata: { eventId, phone: ticket.phone, paymentId, orderId },
          },
          ticket
        )
      }
      return NextResponse.json({ status: "ok" })
    }

    const { phone } = booking

    // 2) Booking for this order already exists (payment/verify ran first).
    const existing = await findParticipantByEventAndOrderId(eventId, orderId)
    if (existing) {
      if (!existing.amountPaid) {
        await updateParticipant(existing.id, {
          amountPaid: true,
          entryType: "PAID",
          paymentId: paymentId ?? null,
          ...chargeFields(booking),
        })
        afterResponse(
          {
            adminUsername: "razorpay-webhook",
            adminRole: "SYSTEM",
            action: "PARTICIPANT_UPDATED",
            entity: "Participant",
            entityId: existing.id,
            description: `Payment confirmed via webhook: ${existing.name} (${existing.ticketCode}) — Payment: ${paymentId}`,
            metadata: { eventId, phone, paymentId, orderId },
          },
          existing
        )
      }
      return NextResponse.json({ status: "ok" })
    }

    // 3) Browser never reached payment/verify — create the booking now.
    //    registerParticipant is idempotent on paymentOrderId, so a concurrent
    //    verify call cannot produce a second ticket for this payment.
    const { participant, isNew } = await registerParticipant({
      eventId,
      name: booking.name,
      phone,
      email: booking.email,
      age: booking.age,
      numberOfParticipants: booking.numberOfParticipants,
      amountPaid: true,
      entryType: "PAID",
      paymentOrderId: orderId,
      paymentId: paymentId ?? null,
      amountPaidPaise: booking.amountPaise,
    })

    if (!isNew) {
      if (!participant.amountPaid) {
        await updateParticipant(participant.id, {
          amountPaid: true,
          entryType: "PAID",
          paymentId: paymentId ?? null,
          ...chargeFields(booking),
        })
        after(() => requestTicketMail(participant.ticketCode, participant.email))
      }
      return NextResponse.json({ status: "ok" })
    }

    afterResponse(
      {
        adminUsername: "razorpay-webhook",
        adminRole: "SYSTEM",
        action: "PARTICIPANT_ADDED",
        entity: "Participant",
        entityId: participant.id,
        description: `Auto-enrolled via Razorpay webhook (browser crash recovery): ${participant.name} (${participant.ticketCode}) — Payment: ${paymentId}`,
        metadata: { eventId, phone, paymentId, orderId },
      },
      participant
    )

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    console.error("[Razorpay Webhook] Processing error:", error)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
