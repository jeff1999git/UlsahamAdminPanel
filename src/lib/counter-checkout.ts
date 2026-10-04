import type { ActionResult } from "@/types"

/** Shown when Razorpay took the money but the confirmation never reached the server. */
export const CONFIRMATION_LOST =
  "Payment received — confirmation didn't reach the server. Check the participant list before charging again."

type CheckoutOptions = ConstructorParameters<Window["Razorpay"]>[0]
type CheckoutResponse = Parameters<CheckoutOptions["handler"]>[0]

export type CounterCheckoutOutcome =
  | { status: "enrolled" }
  /** `paymentId` is set when Razorpay had already taken the money. */
  | { status: "failed"; error: string; paymentId?: string }
  | { status: "dismissed" }

/**
 * The counter's Razorpay Checkout as one promise. The enrol dialog shows
 * "Processing…" until it settles, so it always does: when the server confirms
 * or refuses the payment, when the window is closed without paying, and when
 * the confirmation call itself fails after Razorpay took the money (a dropped
 * connection), with a message telling staff to check the list before charging
 * again. Razorpay calls the handler only once it has taken the money, so a
 * failure from there on carries the payment's id.
 */
export function runCounterCheckout(
  Checkout: Window["Razorpay"],
  options: Omit<CheckoutOptions, "handler" | "modal">,
  confirm: (response: CheckoutResponse) => Promise<ActionResult<unknown>>
): Promise<CounterCheckoutOutcome> {
  return new Promise((resolve) => {
    try {
      new Checkout({
        ...options,
        handler: async (response) => {
          const paymentId = response.razorpay_payment_id
          let outcome: CounterCheckoutOutcome = { status: "failed", error: CONFIRMATION_LOST, paymentId }
          try {
            const result = await confirm(response)
            outcome = result.success ? { status: "enrolled" } : { status: "failed", error: result.error, paymentId }
          } catch {
            // The outcome stays CONFIRMATION_LOST.
          } finally {
            resolve(outcome)
          }
        },
        modal: { ondismiss: () => resolve({ status: "dismissed" }) },
      }).open()
    } catch {
      // Checkout never opened, so nothing was charged.
      resolve({ status: "failed", error: "Could not open the payment window. Please try again." })
    }
  })
}
