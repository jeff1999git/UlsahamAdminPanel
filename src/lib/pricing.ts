export const GST_RATE = 0.18
export const PLATFORM_FEE_RATE = 0.02

export function calculateFeesFromBase(
  base: number,
  couponDiscount = 0,
  gstEnabled = true,
  platformFeeEnabled = true
) {
  const discountApplied = Math.min(couponDiscount, base)
  const discountedBase = Math.max(0, base - discountApplied)
  const gst = gstEnabled ? Math.round(discountedBase * GST_RATE * 100) / 100 : 0
  const platformFee = platformFeeEnabled ? Math.round(discountedBase * PLATFORM_FEE_RATE * 100) / 100 : 0
  const total = Math.round((discountedBase + gst + platformFee) * 100) / 100
  return { base, discount: discountApplied, discountedBase, gst, platformFee, total }
}

export function calculateTicketFees(
  baseAmountPerPerson: number,
  quantity: number,
  couponDiscount = 0,
  gstEnabled = true,
  platformFeeEnabled = true
) {
  return calculateFeesFromBase(baseAmountPerPerson * quantity, couponDiscount, gstEnabled, platformFeeEnabled)
}

// Competition pricing: the first member pays the individual amount, each
// additional group member adds groupExtraAmount (falls back to the individual
// amount when no group rate is set).
export function calculateCompetitionBase(
  individualAmount: number,
  groupExtraAmount: number | null | undefined,
  quantity: number
) {
  const extraRate = groupExtraAmount ?? individualAmount
  return individualAmount + extraRate * Math.max(0, quantity - 1)
}

export function calculateCompetitionFees(
  individualAmount: number,
  groupExtraAmount: number | null | undefined,
  quantity: number,
  couponDiscount = 0,
  gstEnabled = true,
  platformFeeEnabled = true
) {
  const base = calculateCompetitionBase(individualAmount, groupExtraAmount, quantity)
  return calculateFeesFromBase(base, couponDiscount, gstEnabled, platformFeeEnabled)
}
