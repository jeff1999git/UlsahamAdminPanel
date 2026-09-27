import Razorpay from "razorpay"
import { participantSchema } from "@/validators/participant.validator"

let instance: Razorpay | null = null

export function getRazorpay(): Razorpay {
  if (!instance) {
    const key_id = process.env.RAZORPAY_KEY_ID
    const key_secret = process.env.RAZORPAY_KEY_SECRET
    if (!key_id || !key_secret) {
      throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured")
    }
    instance = new Razorpay({ key_id, key_secret })
  }
  return instance
}

/** What a Razorpay order was created for, as recorded in its notes. */
export type OrderBooking =
  | {
      /** A new booking. */
      kind: "new"
      eventId: string
      name: string
      phone: string
      email: string | null
      age: number
      numberOfParticipants: number
    }
  | {
      /** Payment for a ticket that already exists and is unpaid. */
      kind: "repay"
      eventId: string
      ticketCode: string
    }

/**
 * Reads the booking back out of an order's notes. The server writes them when
 * it creates the order, so they — not the browser, and not the payment's own
 * notes, which the payer can set at Checkout — say which event, how many seats
 * and which ticket a payment is for. Returns null when the notes are missing or
 * malformed.
 */
export function bookingFromOrderNotes(notes: unknown): OrderBooking | null {
  // Razorpay returns [] for an order created without notes.
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return null
  const n = notes as Record<string, unknown>

  const eventId = typeof n.eventId === "string" ? n.eventId.trim() : ""
  if (!eventId) return null

  // A re-payment settles a ticket that already holds its buyer and seats, so
  // only the ticket is read; its stored details are not re-validated.
  const ticketCode = typeof n.ticketCode === "string" ? n.ticketCode.trim().toUpperCase() : ""
  if (ticketCode) return { kind: "repay", eventId, ticketCode }

  const parsed = participantSchema.safeParse({
    name: n.name,
    phone: n.phone,
    email: n.email,
    age: n.age,
    numberOfParticipants: n.numberOfParticipants,
  })
  if (!parsed.success) return null

  return { kind: "new", eventId, ...parsed.data, email: parsed.data.email || null }
}

// The SDK sets no timeout of its own, so a hung call would hold the request
// until the platform killed it.
const ORDER_FETCH_TIMEOUT_MS = 8000

/** Fetches an order and reads its booking. Throws when Razorpay cannot be reached in time. */
export async function fetchOrderBooking(orderId: string): Promise<OrderBooking | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out fetching the Razorpay order")), ORDER_FETCH_TIMEOUT_MS)
  })
  try {
    const order = await Promise.race([getRazorpay().orders.fetch(orderId), timeout])
    return bookingFromOrderNotes(order.notes)
  } finally {
    clearTimeout(timer)
  }
}
