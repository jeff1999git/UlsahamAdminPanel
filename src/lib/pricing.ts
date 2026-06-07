export const GST_RATE = 0.18
export const PLATFORM_FEE_RATE = 0.02

export function calculateTicketFees(baseAmountPerPerson: number, quantity: number) {
  const base = baseAmountPerPerson * quantity
  const gst = Math.round(base * GST_RATE * 100) / 100
  const platformFee = Math.round(base * PLATFORM_FEE_RATE * 100) / 100
  const total = Math.round((base + gst + platformFee) * 100) / 100
  return { base, gst, platformFee, total }
}
