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

export const registerRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:register",
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
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: false,
  timeout: WRITE_TIMEOUT_MS,
  prefix: "ulsaham:payment-order",
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
  }
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1"
  )
}
