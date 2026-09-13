import { timingSafeEqual } from "crypto"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { env } from "@/lib/env"

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})

export const registerRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: true,
  prefix: "ulsaham:register",
})

export const eventsListRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
  prefix: "ulsaham:events-list",
})

export const eventDetailRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
  prefix: "ulsaham:event-detail",
})

export const checkTicketRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  analytics: true,
  prefix: "ulsaham:check-ticket",
})

export const paymentOrderRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: true,
  prefix: "ulsaham:payment-order",
})

export const myTicketsRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  analytics: true,
  prefix: "ulsaham:my-tickets",
})

export const couponValidateRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  analytics: true,
  prefix: "ulsaham:coupon-validate",
})

export const myTicketsByUserRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
  prefix: "ulsaham:my-tickets-by-user",
})

export const brandPartnersRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  analytics: true,
  prefix: "ulsaham:brand-partners",
})

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
