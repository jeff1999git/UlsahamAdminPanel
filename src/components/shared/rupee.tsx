import { formatAmount } from "@/lib/utils"

/**
 * The ₹ sign in the system font. Inter's latin subset has no ₹, so drawing it
 * in Inter would make the browser fetch the 85 KB latin-ext font file.
 */
export function Rupee() {
  return <span style={{ fontFamily: "system-ui, sans-serif" }}>₹</span>
}

/** A rupee amount such as ₹1,250, with the sign drawn by <Rupee />. */
export function Amount({ value }: { value: number }) {
  return (
    <>
      <Rupee />
      {formatAmount(value)}
    </>
  )
}
