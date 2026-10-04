import type { CouponCode } from "@prisma/client"

export type CouponCheck =
  | { valid: true; code: string; discount: number }
  /**
   * UNKNOWN: the event has no coupon by that code. NOT_APPLICABLE: it is worth
   * the whole per-person price or more.
   */
  | { valid: false; reason: "UNKNOWN" | "NOT_APPLICABLE" }

/**
 * Whether `code` is a coupon this event accepts, matched case-insensitively.
 * A coupon must be worth less than the per-person price, so it never makes a
 * booking free (complimentary codes do that). apply-coupon and payment/order
 * both decide with this, so a code the site was told is valid is never turned
 * down at payment, and a code it was told is invalid is never charged.
 */
export function validateCoupon(
  event: { couponCodes: CouponCode[]; effectiveAmount: number | null },
  code: string
): CouponCheck {
  const wanted = code.toUpperCase()
  const coupon = event.couponCodes.find((c) => c.code.toUpperCase() === wanted)
  if (!coupon) return { valid: false, reason: "UNKNOWN" }
  if (event.effectiveAmount === null || coupon.discount >= event.effectiveAmount) {
    return { valid: false, reason: "NOT_APPLICABLE" }
  }
  return { valid: true, code: coupon.code, discount: coupon.discount }
}
