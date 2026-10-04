// src/lib/env.ts validates only what the running app needs: the super-admin
// credentials belong to prisma/seed.ts. A missing webhook or proxy secret
// logs one warning instead of failing every route at load, and the code that
// needs each secret still refuses to work without it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runtimeEnvSchema, seedEnvSchema } from "@/lib/env-schema"

const WARNED = Symbol.for("ulsaham.env.missingSecretsWarned")
const flags = globalThis as { [WARNED]?: boolean }
const savedEnv = { ...process.env }

/** A fresh copy of src/lib/env.ts, evaluated against the current process.env. */
async function loadEnv() {
  vi.resetModules()
  return (await import("@/lib/env")).env
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  delete flags[WARNED]
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
  Object.assign(process.env, savedEnv)
  warn.mockRestore()
})

describe("runtime env", () => {
  it("does not require the seed credentials", async () => {
    delete process.env.SUPER_ADMIN_USERNAME
    delete process.env.SUPER_ADMIN_PASSWORD

    expect(runtimeEnvSchema.safeParse(process.env).success).toBe(true)
    const env = await loadEnv()
    expect(env).not.toHaveProperty("SUPER_ADMIN_USERNAME")
    expect(env).not.toHaveProperty("SUPER_ADMIN_PASSWORD")
  })

  it("still stops at load when a required variable is missing", async () => {
    delete process.env.AUTH_SECRET
    await expect(loadEnv()).rejects.toThrow(/^Environment validation failed:\n {2}AUTH_SECRET: /)
  })

  it("warns once per instance, without throwing, when the webhook and proxy secrets are missing", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    process.env.PROXY_SHARED_SECRET = ""

    const env = await loadEnv()
    expect(env.RAZORPAY_WEBHOOK_SECRET).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/RAZORPAY_WEBHOOK_SECRET is not set[\s\S]*PROXY_SHARED_SECRET is not set/)

    // Next can evaluate the module again in another bundle layer.
    await loadEnv()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("stays quiet when both secrets are set", async () => {
    await loadEnv()
    expect(warn).not.toHaveBeenCalled()
  })

  it("SITE_URL is optional: unset or empty means the live site, and a value must be a URL", () => {
    delete process.env.SITE_URL
    expect(runtimeEnvSchema.parse(process.env).SITE_URL).toBe("https://www.ulsaaham.com")
    process.env.SITE_URL = ""
    expect(runtimeEnvSchema.parse(process.env).SITE_URL).toBe("https://www.ulsaaham.com")
    process.env.SITE_URL = "https://preview.example"
    expect(runtimeEnvSchema.parse(process.env).SITE_URL).toBe("https://preview.example")
    process.env.SITE_URL = "www.ulsaaham.com"
    expect(runtimeEnvSchema.safeParse(process.env).success).toBe(false)
  })
})

describe("seed env", () => {
  it("requires the super-admin credentials", () => {
    const result = seedEnvSchema.safeParse({ DATABASE_URL: "mongodb://127.0.0.1:1/x" })
    expect(result.success).toBe(false)
    expect(Object.keys(result.error!.flatten().fieldErrors).sort()).toEqual([
      "SUPER_ADMIN_PASSWORD",
      "SUPER_ADMIN_USERNAME",
    ])
  })

  it("rejects a super-admin password shorter than 8 characters", () => {
    const base = { DATABASE_URL: "mongodb://127.0.0.1:1/x", SUPER_ADMIN_USERNAME: "root" }
    expect(seedEnvSchema.safeParse({ ...base, SUPER_ADMIN_PASSWORD: "short" }).success).toBe(false)
    expect(seedEnvSchema.safeParse({ ...base, SUPER_ADMIN_PASSWORD: "long-enough" }).success).toBe(true)
  })
})

describe("the secrets are still enforced where they are used", () => {
  function proxiedRequest(proxyKey: string) {
    return new Request("https://admin.example/api/public/events", {
      headers: { "x-forwarded-for": "10.0.0.1", "x-client-ip": "203.0.113.7", "x-proxy-key": proxyKey },
    })
  }

  it("getClientIP trusts the relayed visitor IP only with the shared secret", async () => {
    // An untrusted relay is logged once per instance (test/booking-routes.test.ts).
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    // The real module (test/setup.ts mocks the limiters), reloaded with env.
    type RateLimitModule = typeof import("@/lib/ratelimit")
    vi.resetModules()
    let { getClientIP } = await vi.importActual<RateLimitModule>("@/lib/ratelimit")
    expect(getClientIP(proxiedRequest("test-proxy-secret"))).toBe("203.0.113.7")
    expect(getClientIP(proxiedRequest("wrong-secret"))).toBe("10.0.0.1")

    process.env.PROXY_SHARED_SECRET = ""
    vi.resetModules()
    ;({ getClientIP } = await vi.importActual<RateLimitModule>("@/lib/ratelimit"))
    expect(getClientIP(proxiedRequest(""))).toBe("10.0.0.1")
    expect(getClientIP(proxiedRequest("test-proxy-secret"))).toBe("10.0.0.1")
    consoleError.mockRestore()
  })

  it("the Razorpay webhook answers 500 without its secret", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    vi.resetModules()
    const { POST } = await import("@/app/api/razorpay/webhook/route")
    const { NextRequest } = await import("next/server")

    const response = await POST(
      new NextRequest("https://admin.example/api/razorpay/webhook", {
        method: "POST",
        body: JSON.stringify({ event: "payment.captured" }),
        headers: { "x-razorpay-signature": "00" },
      })
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Webhook not configured" })
    consoleError.mockRestore()
  })
})
