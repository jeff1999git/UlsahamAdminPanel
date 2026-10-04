/**
 * The pairing behind scripts/report-unrecorded-payments.ts, kept free of any
 * database, Razorpay or environment access so it can be tested on its own.
 */

export type RzpPayment = {
  id: string
  order_id?: string | null
  status: string
  amount: number
  created_at: number
  email?: string
  contact?: string
  notes?: Record<string, string> | unknown[]
}

export type BookingRow = {
  eventId: string
  phone: string
  ticketCode: string
  amountPaid: boolean
  registeredAt: Date
  paymentOrderId: string | null
}

export type EventRow = {
  id: string
  name: string
  date: Date
  /** Set (> 0) by the prune when it deletes the event's bookings; 0 if it never did. */
  archivedParticipantCount?: number | null
}

export type ReportRow = {
  status: typeof UNRECORDED | typeof PRUNED
  paymentId: string
  orderId: string
  paidAt: string
  amountINR: string
  event: string
  name: string
  phone: string
  email: string
  quantity: string
}

export const UNRECORDED = "UNRECORDED"
export const PRUNED = "PRUNED (booking archived)"

/** Bookings are deleted this long after their event (pruneOldEventParticipants). */
export const PRUNE_AFTER_DAYS = 14
const PAIRING_WINDOW_MS = 30 * 60 * 1000 // booking written within 30 min of payment

/** Notes as a plain record: Razorpay sends [] for an order or payment without notes. */
export function notesRecord(notes: unknown): Record<string, string> {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return {}
  return Object.fromEntries(
    Object.entries(notes as Record<string, unknown>).map(([key, value]) => [key, value == null ? "" : String(value)])
  )
}

/**
 * Payments no booking claims by their order id. Only these need their order's
 * notes, which the report fetches from Razorpay.
 */
export function paymentsWithoutOrderMatch(payments: RzpPayment[], bookings: BookingRow[]): RzpPayment[] {
  const orders = new Set(bookings.flatMap((b) => (b.paymentOrderId ? [b.paymentOrderId] : [])))
  return payments.filter((pay) => !(pay.order_id && orders.has(pay.order_id)))
}

/**
 * Pairs captured payments with bookings; whatever is left over was never
 * recorded. A payment no booking claims by order id is read from its order's
 * notes (`orderNotes`, by order id), which the server wrote, rather than the
 * payment's own notes, which the payer can set at Checkout; the payment's
 * notes stand in only when its order could not be fetched.
 *
 * An unpaired payment for an event more than PRUNE_AFTER_DAYS past, whose
 * bookings are all gone, is labelled PRUNED rather than UNRECORDED: the prune
 * deleted its bookings, so it cannot be checked here. Only an event the prune
 * archived (archivedParticipantCount > 0) counts: one that never had a booking
 * was never pruned, so its payment really is unrecorded.
 */
export function pairPayments(input: {
  payments: RzpPayment[]
  bookings: BookingRow[]
  events: EventRow[]
  orderNotes: Map<string, Record<string, string>>
  now: Date
}): { recorded: number; rows: ReportRow[] } {
  const { payments, bookings, events, orderNotes, now } = input
  const eventById = new Map(events.map((e) => [e.id, e]))
  const pruneCutoff = new Date(now)
  pruneCutoff.setDate(pruneCutoff.getDate() - PRUNE_AFTER_DAYS)
  const eventsWithBookings = new Set(bookings.map((b) => b.eventId))

  const byOrder = new Set(bookings.flatMap((b) => (b.paymentOrderId ? [b.paymentOrderId] : [])))
  const byTicket = new Map(bookings.map((b) => [b.ticketCode, b]))
  const legacyPool = new Map<string, BookingRow[]>() // eventId|phone -> unclaimed bookings
  for (const b of bookings) {
    if (b.paymentOrderId) continue
    const k = `${b.eventId}|${b.phone}`
    legacyPool.set(k, [...(legacyPool.get(k) ?? []), b])
  }
  for (const list of legacyPool.values()) list.sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime())

  const rows: ReportRow[] = []
  let recorded = 0
  for (const pay of payments) {
    if (pay.order_id && byOrder.has(pay.order_id)) { recorded++; continue }

    const fromOrder = pay.order_id ? orderNotes.get(pay.order_id) : undefined
    const notes = fromOrder ?? notesRecord(pay.notes)
    const eventId = notes.eventId
    const phone = notes.phone
    if (!eventId || !phone) continue // not a ticket payment

    if (notes.ticketCode && byTicket.get(notes.ticketCode.toUpperCase())?.amountPaid) { recorded++; continue }

    // Legacy pairing: the booking written closest after this payment for the same event+phone.
    const pool = legacyPool.get(`${eventId}|${phone}`) ?? []
    const payAt = pay.created_at * 1000
    const idx = pool.findIndex((b) => Math.abs(b.registeredAt.getTime() - payAt) <= PAIRING_WINDOW_MS)
    if (idx >= 0) { pool.splice(idx, 1); recorded++; continue }

    const event = eventById.get(eventId)
    const pruned =
      !!event &&
      event.date < pruneCutoff &&
      (event.archivedParticipantCount ?? 0) > 0 &&
      !eventsWithBookings.has(eventId)
    rows.push({
      status: pruned ? PRUNED : UNRECORDED,
      paymentId: pay.id,
      orderId: pay.order_id ?? "",
      paidAt: new Date(payAt).toISOString(),
      amountINR: (pay.amount / 100).toFixed(2),
      event: event?.name ?? eventId,
      name: notes.name ?? "",
      phone,
      email: notes.email ?? "",
      quantity: notes.numberOfParticipants ?? "1",
    })
  }

  // Unrecorded first: those are the ones to act on.
  rows.sort((a, b) => Number(a.status === PRUNED) - Number(b.status === PRUNED))
  return { recorded, rows }
}
