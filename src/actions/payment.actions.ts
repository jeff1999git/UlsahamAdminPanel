"use server"

import crypto from "crypto"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { getRazorpay } from "@/lib/razorpay"
import { calculateTicketFees, calculateCompetitionFees } from "@/lib/pricing"
import { validateCompetitionQuantity } from "@/lib/competition"
import { findEventById } from "@/repositories/event.repository"
import { countParticipantsForEvent } from "@/repositories/participant.repository"
import { registerParticipant } from "@/services/participant.service"
import { participantSchema } from "@/validators/participant.validator"
import { logActivity } from "@/lib/activity-logger"
import type { ActionResult } from "@/types"
import type { Participant } from "@prisma/client"

async function getSession() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return {
    username: (session.user as { username?: string }).username ?? "unknown",
    role: (session.user as { role?: string }).role ?? "USER",
  }
}

export type CreateOrderResult = {
  orderId: string
  amount: number
  currency: string
  keyId: string
}

export async function createPaymentOrderAction(
  eventId: string,
  formData: Record<string, unknown>
): Promise<ActionResult<CreateOrderResult>> {
  await getSession()

  const parsed = participantSchema.safeParse(formData)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    const first = Object.values(errors)[0]?.[0]
    return { success: false, error: first ?? "Validation failed" }
  }

  try {
    const event = await findEventById(eventId)
    if (!event) return { success: false, error: "Event not found" }
    if (event.status !== "PUBLISHED") return { success: false, error: "Event is not accepting registrations" }
    if (event.isFree || !event.amount) return { success: false, error: "This is a free event" }

    // Each enrollment is its own booking — a phone number may hold several.
    const quantity = parsed.data.numberOfParticipants

    const quantityError = validateCompetitionQuantity(event, quantity)
    if (quantityError) return { success: false, error: quantityError }

    if (event.capacity !== null) {
      const currentCount = await countParticipantsForEvent(eventId)
      if (currentCount + quantity > event.capacity) {
        return { success: false, error: "Event is full" }
      }
    }

    const keyId = process.env.RAZORPAY_KEY_ID
    if (!keyId) return { success: false, error: "Payment gateway not configured" }

    const effectiveAmount =
      event.isEarlyBird && event.earlyBirdAmount != null ? event.earlyBirdAmount : event.amount
    const { total } = event.isCompetition
      ? calculateCompetitionFees(effectiveAmount, event.groupExtraAmount, quantity, 0, event.gstEnabled, event.platformFeeEnabled)
      : calculateTicketFees(effectiveAmount, quantity, 0, event.gstEnabled, event.platformFeeEnabled)
    const totalAmountPaise = Math.round(total * 100)

    const order = await getRazorpay().orders.create({
      amount: totalAmountPaise,
      currency: "INR",
      receipt: `evt_${eventId.slice(-8)}_${Date.now()}`,
      notes: {
        eventId,
        eventName: event.name,
        phone: parsed.data.phone,
        name: parsed.data.name,
        email: parsed.data.email ?? "",
        age: String(parsed.data.age),
        numberOfParticipants: String(quantity),
      },
    })

    return {
      success: true,
      data: { orderId: order.id, amount: totalAmountPaise, currency: "INR", keyId },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create payment order"
    return { success: false, error: msg }
  }
}

export async function verifyAndEnrollAction(
  paymentData: {
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
  },
  eventId: string,
  formData: Record<string, unknown>
): Promise<ActionResult<Participant>> {
  const session = await getSession()

  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) return { success: false, error: "Payment configuration error" }

  // HMAC-SHA256 signature verification — protects against tampered callbacks
  const body = `${paymentData.razorpay_order_id}|${paymentData.razorpay_payment_id}`
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex")
  if (expected !== paymentData.razorpay_signature) {
    return { success: false, error: "Payment verification failed. Please contact support." }
  }

  const parsed = participantSchema.safeParse(formData)
  if (!parsed.success) return { success: false, error: "Invalid form data" }

  try {
    // Idempotent on the Razorpay order id: if the webhook already enrolled
    // this order, the existing booking is returned instead of a second one.
    const { participant, isNew } = await registerParticipant({
      eventId,
      ...parsed.data,
      email: parsed.data.email || null,
      amountPaid: true,
      paymentOrderId: paymentData.razorpay_order_id,
      paymentId: paymentData.razorpay_payment_id,
    })

    if (!isNew) {
      revalidatePath(`/admin/events/${eventId}/participants`)
      return { success: true, data: participant }
    }

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "PARTICIPANT_ADDED",
      entity: "Participant",
      entityId: participant.id,
      description: `Self-enrolled (paid): ${participant.name} (${participant.ticketCode}) — Payment: ${paymentData.razorpay_payment_id}`,
      metadata: {
        eventId,
        phone: participant.phone,
        paymentId: paymentData.razorpay_payment_id,
        orderId: paymentData.razorpay_order_id,
      },
    })

    revalidatePath(`/admin/events/${eventId}/participants`)
    return { success: true, data: participant }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to complete enrollment"
    return { success: false, error: msg }
  }
}
