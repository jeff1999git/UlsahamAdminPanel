import type { EntryType, Participant } from "@prisma/client"

/** What the admin panel shows for a booking: how it was settled, or that it was not. */
export type EntryStatus = EntryType | "UNPAID"

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  PAID: "Paid",
  COMPLIMENTARY: "Complimentary",
  FREE: "Free",
  UNPAID: "Unpaid",
}

/**
 * The entry type of a booking. Bookings made before entry types existed carry
 * none, so one is inferred: a Razorpay reference means Paid, a free event
 * means Free, and any other settled booking shows as Paid — a manual tick and
 * an older complimentary-code booking cannot be told apart.
 */
export function entryStatusOf(
  p: Pick<Participant, "entryType" | "amountPaid" | "paymentId" | "paymentOrderId">,
  eventIsFree: boolean
): EntryStatus {
  if (!p.amountPaid) return "UNPAID"
  if (p.entryType) return p.entryType
  if (p.paymentId || p.paymentOrderId) return "PAID"
  return eventIsFree ? "FREE" : "PAID"
}
