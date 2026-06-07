"use server"

import crypto from "crypto"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { getRazorpay } from "@/lib/razorpay"
import { findEventById } from "@/repositories/event.repository"
import {
  findParticipantByEventAndPhone,
  countParticipantsForEvent,
} from "@/repositories/participant.repository"
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

    const existing = await findParticipantByEventAndPhone(eventId, parsed.data.phone)
    if (existing) return { success: false, error: "Phone number already registered for this event" }

    if (event.capacity !== null) {
      const currentCount = await countParticipantsForEvent(eventId)
      if (currentCount + parsed.data.numberOfParticipants > event.capacity) {
        return { success: false, error: "Event is full" }
      }
    }

    const totalAmountPaise = Math.round(event.amount * parsed.data.numberOfParticipants * 100)

    const order = await getRazorpay().orders.create({
      amount: totalAmountPaise,
      currency: "INR",
      receipt: `evt_${eventId.slice(-8)}_${Date.now()}`,
      notes: {
        eventId,
        eventName: event.name,
        phone: parsed.data.phone,
        numberOfParticipants: String(parsed.data.numberOfParticipants),
      },
    })

    const keyId = process.env.RAZORPAY_KEY_ID
    if (!keyId) throw new Error("RAZORPAY_KEY_ID is not configured")

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
    const { participant } = await registerParticipant({
      eventId,
      ...parsed.data,
      email: parsed.data.email || null,
      amountPaid: true,
    })

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
