import { createHmac } from "crypto"
import { env } from "@/lib/env"

/** How long a request to the site may take; it runs after the webhook has answered. */
const TICKET_MAIL_TIMEOUT_MS = 5000

/**
 * The signature the site's /api/internal/ticket-mail checks: lowercase hex
 * HMAC-SHA256 over `${timestamp}.${rawBody}`, keyed with PROXY_SHARED_SECRET.
 * The timestamp is Unix epoch milliseconds as a decimal string; the site
 * refuses one more than five minutes from its own clock.
 */
export function signTicketMail(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
}

/**
 * Asks the customer site to email a ticket. The Razorpay webhook calls this,
 * after its response, for a booking it created or an unpaid ticket it settled:
 * the browser that would have sent the email never came back. The site reads
 * the booking back by its code and builds the mail from that, so only the code
 * and the address travel, both covered by the signature. Never throws: a
 * failure is logged, and the customer can still email the ticket from My Bookings.
 */
export async function requestTicketMail(ticketCode: string, email: string | null): Promise<void> {
  // The site's lookup does not return the booking's address, so a booking
  // without one has nothing to send.
  if (!email) return
  const secret = env.PROXY_SHARED_SECRET
  if (!secret) {
    console.error(`[ticket-mail] PROXY_SHARED_SECRET is not set, so ticket ${ticketCode} was not emailed.`)
    return
  }

  const rawBody = JSON.stringify({ ticketCode, email })
  const timestamp = String(Date.now())
  try {
    const response = await fetch(`${env.SITE_URL.replace(/\/+$/, "")}/api/internal/ticket-mail`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ulsaham-timestamp": timestamp,
        "x-ulsaham-signature": signTicketMail(secret, timestamp, rawBody),
      },
      body: rawBody,
      signal: AbortSignal.timeout(TICKET_MAIL_TIMEOUT_MS),
    })
    if (!response.ok) console.error(`[ticket-mail] The site answered ${response.status} for ticket ${ticketCode}.`)
  } catch (error) {
    console.error(`[ticket-mail] Could not reach the site for ticket ${ticketCode}:`, error)
  }
}
