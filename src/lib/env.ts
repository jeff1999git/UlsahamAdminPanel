import { describeEnvErrors, runtimeEnvSchema } from "@/lib/env-schema"

const parseResult = runtimeEnvSchema.safeParse(process.env)

if (!parseResult.success) {
  throw new Error(`Environment validation failed:\n${describeEnvErrors(parseResult.error)}`)
}

export const env = parseResult.data

// Optional at load (a throw here would fail every route), but production needs
// them. Next can load this module more than once per server, so a global keeps
// it to one warning per instance.
const MISSING_SECRET_EFFECTS = {
  RAZORPAY_WEBHOOK_SECRET: "the Razorpay webhook answers 500, so paid bookings have no crash recovery",
  PROXY_SHARED_SECRET: "visitors coming through the customer site's proxy share one rate-limit bucket",
} as const
const WARNED = Symbol.for("ulsaham.env.missingSecretsWarned")
const flags = globalThis as { [WARNED]?: boolean }
const missing = (Object.keys(MISSING_SECRET_EFFECTS) as Array<keyof typeof MISSING_SECRET_EFFECTS>).filter(
  (name) => !env[name]
)
if (missing.length && !flags[WARNED]) {
  flags[WARNED] = true
  console.warn(missing.map((name) => `[env] ${name} is not set: ${MISSING_SECRET_EFFECTS[name]}.`).join("\n"))
}
