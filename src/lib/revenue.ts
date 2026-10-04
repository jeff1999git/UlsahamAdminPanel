import type { Participant, Prisma } from "@prisma/client"
import { entryStatusOf } from "@/lib/entry-type"

/**
 * Bookings with no recorded charge: amountPaidPaise is missing on rows written
 * before it existed (MongoDB keeps "missing" apart from null), or null.
 */
export const NO_RECORDED_CHARGE = {
  OR: [{ amountPaidPaise: { isSet: false } }, { amountPaidPaise: null }],
} satisfies Prisma.ParticipantWhereInput

/** The booking fields the revenue estimate reads. */
export type EstimatedBooking = Pick<
  Participant,
  "numberOfParticipants" | "amountPaid" | "entryType" | "paymentId" | "paymentOrderId"
>

/**
 * Revenue, in paise, of paid bookings recorded before amountPaidPaise existed:
 * seats × the event's base price, the dashboard's estimate from before the
 * charged amount was stored (it misses early-bird prices, coupons, group rates
 * and fees). Complimentary and free entries bring in nothing.
 */
export function estimatedRevenuePaise(bookings: EstimatedBooking[], eventAmount: number | null): number {
  return bookings
    .filter((p) => entryStatusOf(p, false) === "PAID")
    .reduce((sum, p) => sum + Math.round(p.numberOfParticipants * (eventAmount ?? 0) * 100), 0)
}
