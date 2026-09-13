import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import {
  findParticipantByEventAndOrderId,
  findParticipantByTicketCodeOnly,
  updateParticipant,
} from "@/repositories/participant.repository"
import { registerParticipant } from "@/services/participant.service"
import { logActivity } from "@/lib/activity-logger"

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
  const sigBuf = Buffer.from(signature, "hex")
  const expBuf = Buffer.from(expected, "hex")
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
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
    const notes = entity?.notes as Record<string, string> | undefined
    const paymentId = entity?.id as string | undefined
    const orderId = entity?.order_id as string | undefined

    const eventId = notes?.eventId
    const phone = notes?.phone
    const name = notes?.name
    const email = notes?.email || null
    const age = notes?.age ? parseInt(notes.age, 10) : undefined
    const numberOfParticipants = notes?.numberOfParticipants
      ? parseInt(notes.numberOfParticipants, 10)
      : 1
    const repayTicketCode = notes?.ticketCode

    if (!eventId || !phone) {
      console.error("[Razorpay Webhook] Missing eventId or phone in notes")
      // Return 200 so Razorpay doesn't keep retrying an unrecoverable case
      return NextResponse.json({ status: "skipped" })
    }

    // 1) Re-payment of an existing unpaid ticket (order carried its ticketCode).
    if (repayTicketCode) {
      const ticket = await findParticipantByTicketCodeOnly(repayTicketCode)
      if (!ticket || ticket.eventId !== eventId) {
        console.error("[Razorpay Webhook] Re-payment ticket not found", { eventId, repayTicketCode })
        return NextResponse.json({ status: "skipped" })
      }
      if (!ticket.amountPaid) {
        await updateParticipant(ticket.id, {
          amountPaid: true,
          paymentId: paymentId ?? null,
          paymentOrderId: ticket.paymentOrderId ?? orderId ?? null,
        })
        await logActivity({
          adminUsername: "razorpay-webhook",
          adminRole: "SYSTEM",
          action: "PARTICIPANT_UPDATED",
          entity: "Participant",
          entityId: ticket.id,
          description: `Payment confirmed via webhook: ${ticket.name} (${ticket.ticketCode}) — Payment: ${paymentId}`,
          metadata: { eventId, phone, paymentId, orderId },
        })
      }
      return NextResponse.json({ status: "ok" })
    }

    if (!orderId) {
      console.error("[Razorpay Webhook] Missing order_id on payment entity")
      return NextResponse.json({ status: "skipped" })
    }

    // 2) Booking for this order already exists (payment/verify ran first).
    const existing = await findParticipantByEventAndOrderId(eventId, orderId)
    if (existing) {
      if (!existing.amountPaid) {
        await updateParticipant(existing.id, { amountPaid: true, paymentId: paymentId ?? null })
        await logActivity({
          adminUsername: "razorpay-webhook",
          adminRole: "SYSTEM",
          action: "PARTICIPANT_UPDATED",
          entity: "Participant",
          entityId: existing.id,
          description: `Payment confirmed via webhook: ${existing.name} (${existing.ticketCode}) — Payment: ${paymentId}`,
          metadata: { eventId, phone, paymentId, orderId },
        })
      }
      return NextResponse.json({ status: "ok" })
    }

    // 3) Browser never reached payment/verify — create the booking now.
    //    registerParticipant is idempotent on paymentOrderId, so a concurrent
    //    verify call cannot produce a second ticket for this payment.
    if (!name || age === undefined || isNaN(age)) {
      console.error("[Razorpay Webhook] Insufficient notes data to create participant", notes)
      return NextResponse.json({ status: "skipped" })
    }

    const { participant, isNew } = await registerParticipant({
      eventId,
      name,
      phone,
      email,
      age,
      numberOfParticipants,
      amountPaid: true,
      paymentOrderId: orderId,
      paymentId: paymentId ?? null,
    })

    if (!isNew) {
      if (!participant.amountPaid) {
        await updateParticipant(participant.id, { amountPaid: true, paymentId: paymentId ?? null })
      }
      return NextResponse.json({ status: "ok" })
    }

    await logActivity({
      adminUsername: "razorpay-webhook",
      adminRole: "SYSTEM",
      action: "PARTICIPANT_ADDED",
      entity: "Participant",
      entityId: participant.id,
      description: `Auto-enrolled via Razorpay webhook (browser crash recovery): ${participant.name} (${participant.ticketCode}) — Payment: ${paymentId}`,
      metadata: { eventId, phone, paymentId, orderId },
    })

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    console.error("[Razorpay Webhook] Processing error:", error)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
