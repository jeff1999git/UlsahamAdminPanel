export const GST_RATE = 0.18
export const PLATFORM_FEE_RATE = 0.02

export function calculateTicketFees(
  baseAmountPerPerson: number,
  quantity: number,
  couponDiscount = 0
) {
  const base = baseAmountPerPerson * quantity
  const discountApplied = Math.min(couponDiscount, base)
  const discountedBase = Math.max(0, base - discountApplied)
  const gst = Math.round(discountedBase * GST_RATE * 100) / 100
  const platformFee = Math.round(discountedBase * PLATFORM_FEE_RATE * 100) / 100
  const total = Math.round((discountedBase + gst + platformFee) * 100) / 100
  return { base, discount: discountApplied, discountedBase, gst, platformFee, total }
}
