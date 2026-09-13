import { createHmac } from "crypto"
import { TICKET_CODE_PREFIX } from "@/constants"

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const RANDOM_PART_LENGTH = 6

function randomChars(length: number): string {
  let result = ""
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (const byte of array) {
    result += ALPHANUMERIC[byte % ALPHANUMERIC.length]
  }
  return result
}

/**
 * Derives a stable code from a seed (e.g. a Razorpay order id). The same seed
 * always yields the same characters, so two concurrent attempts to create a
 * booking for the same order collide on the ticketCode unique index instead of
 * producing two tickets. Keyed with the Razorpay secret so codes cannot be
 * derived from a leaked order id.
 */
function seededChars(seed: string, length: number): string {
  const key = process.env.RAZORPAY_KEY_SECRET ?? "ulsaham-ticket-code"
  const digest = createHmac("sha256", key).update(seed).digest()
  let result = ""
  for (let i = 0; i < length; i++) {
    result += ALPHANUMERIC[digest[i] % ALPHANUMERIC.length]
  }
  return result
}

/**
 * Builds a ticket code such as `UE-SUMMER-A1B2C3`.
 *
 * @param eventSlug slug of the event the ticket belongs to
 * @param seed optional idempotency seed (Razorpay order id). When given, the
 *   code is deterministic for that seed; when omitted it is random.
 */
export function generateTicketCode(eventSlug: string, seed?: string): string {
  const slugPart = eventSlug
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)
    .padEnd(6, "X")

  const randomPart = seed ? seededChars(seed, RANDOM_PART_LENGTH) : randomChars(RANDOM_PART_LENGTH)

  return `${TICKET_CODE_PREFIX}-${slugPart}-${randomPart}`
}
