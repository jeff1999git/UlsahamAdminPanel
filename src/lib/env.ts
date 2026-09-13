import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url().optional(),
  SUPER_ADMIN_USERNAME: z.string().min(1, "SUPER_ADMIN_USERNAME is required"),
  SUPER_ADMIN_PASSWORD: z.string().min(8, "SUPER_ADMIN_PASSWORD must be at least 8 characters"),
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
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Shared with the customer site's server-side proxy so per-visitor rate
  // limiting works behind it (Vercel overwrites x-forwarded-for on ingress).
  PROXY_SHARED_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
})

const parseResult = envSchema.safeParse(process.env)

if (!parseResult.success) {
  const errors = parseResult.error.flatten().fieldErrors
  const messages = Object.entries(errors)
    .map(([field, msgs]) => `  ${field}: ${msgs?.join(", ")}`)
    .join("\n")
  throw new Error(`Environment validation failed:\n${messages}`)
}

export const env = parseResult.data
