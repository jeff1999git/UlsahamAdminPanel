import { timingSafeEqual } from "crypto"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { env } from "@/lib/env"

// One quick retry: the SDK default (5 retries, ~4.3 s of backoff) could hold a
// request for seconds while Upstash is unreachable.
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
  retry: { retries: 1, backoff: () => 50 },
})

// A limiter that has not answered within its timeout lets the request through,
// so a slow Upstash costs at most this long. Reads get 2 s (a cold instance's
// first call also pays DNS and TLS); the others get 3 s so abuse protection
// holds on cold starts. Analytics stays off: it adds an Upstash command to
// every call and nothing reads it.
const READ_TIMEOUT_MS = 2000
const WRITE_TIMEOUT_MS = 3000

// Bookings (free or complimentary registrations and payment orders) are
// limited per visitor IP and phone, ten an hour, with a per-IP ceiling of
// sixty an hour; see allowBooking.
export const registerRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:register",
})

export const registerIpRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 h"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:register-ip",
})

export const eventsListRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: false,
  timeout: READ_TIMEOUT_MS,
  prefix: "ulsaham:events-list",
})

export const eventDetailRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: false,
  timeout: READ_TIMEOUT_MS,
  prefix: "ulsaham:event-detail",
})

export const checkTicketRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  analytics: false,
  timeout: READ_TIMEOUT_MS,
  prefix: "ulsaham:check-ticket",
})

export const paymentOrderRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:payment-order",
})

export const paymentOrderIpRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 h"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:payment-order-ip",
})

// The site retries a confirmation a few times, so a buyer stays far below this.
export const verifyRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:payment-verify",
})

// The site polls every few seconds for about a minute after a lost payment
// reply, which stays under this.
export const paymentStatusRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  analytics: false,
  timeout: READ_TIMEOUT_MS,
  prefix: "ulsaham:payment-status",
})

export const myTicketsRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:my-tickets",
})

export const couponValidateRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:coupon-validate",
})

export const myTicketsByUserRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:my-tickets-by-user",
})

export const brandPartnersRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  analytics: false,
  timeout: READ_TIMEOUT_MS,
  prefix: "ulsaham:brand-partners",
})

/**
 * Whether `id` is still under `limiter`'s limit. Fails open: when Upstash
 * errors (outage, exhausted quota, bad token) the request goes through and the
 * failure is logged, instead of every public route answering 500.
 */
export async function allow(limiter: Ratelimit, id: string): Promise<boolean> {
  try {
    return (await limiter.limit(id)).success
  } catch (error) {
    console.error("Rate limiter unavailable; allowing the request:", error)
    return true
  }
}

/**
 * Whether a booking attempt may go ahead. Keyed on the visitor's IP and the
 * booking's phone, so buyers sharing one address (a carrier's NAT, a college
 * network) do not use up each other's attempts, plus a looser per-IP ceiling
 * so one address cannot cycle through phone numbers. Callers check it after
 * validating the body, so a malformed request costs nothing. Both buckets are
 * asked at once, and each fails open as allow() does.
 */
export async function allowBooking(
  limiters: { perPhone: Ratelimit; perIp: Ratelimit },
  ip: string,
  phone: string
): Promise<boolean> {
  const [phoneAllowed, ipAllowed] = await Promise.all([
    allow(limiters.perPhone, `${ip}:${phone}`),
    allow(limiters.perIp, ip),
  ])
  return phoneAllowed && ipAllowed
}

/**
 * Runs `job` at most once per `seconds` across all instances, claimed with an
 * Upstash key set NX with an expiry. For housekeeping started from page views.
 * When Upstash cannot be reached the job runs anyway, as it did before the
 * throttle existed.
 */
export async function runThrottled(name: string, seconds: number, job: () => Promise<unknown>): Promise<void> {
  let claimed = true
  try {
    claimed = (await redis.set(`ulsaham:job:${name}`, Date.now(), { nx: true, ex: seconds })) === "OK"
  } catch (error) {
    console.error(`Could not reach Upstash to throttle ${name}; running it anyway:`, error)
  }
  if (!claimed) return

  try {
    await job()
  } catch (error) {
    console.error(`${name} failed:`, error)
  }
}

function isTrustedProxy(request: Request): boolean {
  const secret = env.PROXY_SHARED_SECRET
  const presented = request.headers.get("x-proxy-key")
  if (!secret || !presented) return false
  const a = Buffer.from(secret)
  const b = Buffer.from(presented)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Next can load this module more than once per server, so a global keeps the
// log below to one line per instance.
const UNTRUSTED_RELAY_LOGGED = Symbol.for("ulsaham.ratelimit.untrustedRelayLogged")
const relayFlags = globalThis as { [UNTRUSTED_RELAY_LOGGED]?: boolean }

/**
 * IP used for rate limiting. Requests relayed by the customer site's own
 * server-side proxy arrive from the proxy's egress address, and Vercel
 * overwrites x-forwarded-for on ingress, so the proxy sends the visitor's IP
 * in x-client-ip together with a shared secret. Without the secret every
 * visitor of the site would share one rate-limit bucket.
 */
export function getClientIP(request: Request): string {
  if (isTrustedProxy(request)) {
    const relayed = request.headers.get("x-client-ip")?.trim()
    if (relayed) return relayed
  } else if (request.headers.has("x-client-ip") && !relayFlags[UNTRUSTED_RELAY_LOGGED]) {
    relayFlags[UNTRUSTED_RELAY_LOGGED] = true
    console.error(
      "[ratelimit] A request relayed a visitor IP (x-client-ip) without a valid x-proxy-key, so it was ignored. " +
        "If the customer site sent it, PROXY_SHARED_SECRET differs between the two projects and every site visitor shares one rate-limit bucket."
    )
  }
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1"
  )
}
