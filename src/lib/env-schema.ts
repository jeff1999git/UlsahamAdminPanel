import { z } from "zod"

// Schemas only, so prisma/seed.ts can import the seed schema without running
// the app's validation in src/lib/env.ts.

/** What the running app needs. Parsed once in src/lib/env.ts. */
export const runtimeEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
  CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
  CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1, "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is required"),
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL").default("http://localhost:3001"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  // Optional so a missing value cannot fail every route at load; src/lib/env.ts
  // warns instead, and the code that needs each one refuses to work without it.
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Shared with the customer site's server-side proxy so per-visitor rate
  // limiting works behind it (Vercel overwrites x-forwarded-for on ingress).
  // It also signs the webhook's ticket-mail requests to the site.
  PROXY_SHARED_SECRET: z.string().optional(),
  // The customer site, which emails tickets for bookings the Razorpay webhook
  // completes (src/lib/site-ticket-mail.ts). An empty value means the default.
  SITE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url("SITE_URL must be a valid URL").default("https://www.ulsaaham.com")
  ),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
})

/** Only prisma/seed.ts needs these; the deployed app never reads them. */
export const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPER_ADMIN_USERNAME: z.string().min(1, "SUPER_ADMIN_USERNAME is required"),
  SUPER_ADMIN_PASSWORD: z.string().min(8, "SUPER_ADMIN_PASSWORD must be at least 8 characters"),
})

/** One "  NAME: message" line per invalid variable (never the values). */
export function describeEnvErrors(error: z.ZodError): string {
  return Object.entries(error.flatten().fieldErrors)
    .map(([field, msgs]) => `  ${field}: ${msgs?.join(", ")}`)
    .join("\n")
}
