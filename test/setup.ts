// Runs before every test file. Unit tests never reach MongoDB, Upstash,
// Cloudinary or Razorpay: every key src/lib/env.ts requires gets a dummy value
// here, and the Prisma client, the rate limiters and NextAuth are replaced
// before any module under test can load the real ones. Never load dotenv or
// .env.local here: that file holds production credentials.
import { vi } from "vitest"

const TEST_ENV: Record<string, string> = {
  AUTH_SECRET: "test-auth-secret",
  SUPER_ADMIN_USERNAME: "test_admin",
  SUPER_ADMIN_PASSWORD: "test-password",
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret",
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "test-cloud",
  UPSTASH_REDIS_REST_URL: "http://127.0.0.1:1",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
  RAZORPAY_KEY_ID: "rzp_test_dummy",
  RAZORPAY_KEY_SECRET: "test_secret",
  RAZORPAY_WEBHOOK_SECRET: "test_webhook_secret",
  PROXY_SHARED_SECRET: "test-proxy-secret",
}
// Secrets from the shell are always replaced, so a test can never use them.
Object.assign(process.env, TEST_ENV)

// DATABASE_URL may be given (a local MongoDB for a future integration test),
// but only on this machine: a remote URL stops the whole run. The URL itself
// is never printed.
process.env.DATABASE_URL ??= "mongodb://127.0.0.1:1/ulsaham-test"
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"])
let databaseHost = ""
try {
  databaseHost = new URL(process.env.DATABASE_URL).hostname
} catch {
  // Unparsable (e.g. several hosts): treated as remote.
}
if (!LOCAL_HOSTS.has(databaseHost)) {
  throw new Error("Unit tests refuse to run: DATABASE_URL must point at localhost.")
}

// Nothing in a unit test goes over the network. This covers fetch (Upstash,
// Cloudinary's REST calls); a test that needs a response mocks fetch itself.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => {
    throw new Error("Network access in a unit test: mock fetch or the module that calls it")
  })
)

// Any Prisma access fails loudly, so a missed repository mock is an error
// rather than a query against a real database.
vi.mock("@/lib/prisma", () => {
  const refuse = (key: string): never => {
    throw new Error(`DB access in a unit test (prisma.${key}): mock the repository instead`)
  }
  const prisma = new Proxy(
    {},
    {
      // Symbols and "then" are probed by the test runner and by await; they
      // are not database access.
      get: (_target, key) => (typeof key === "symbol" || key === "then" ? undefined : refuse(key)),
    }
  )
  return { prisma }
})

// Every limiter lets the request through. getClientIP and allow() stay real;
// runThrottled never runs its housekeeping job.
vi.mock("@/lib/ratelimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ratelimit")>()
  const mocked: Record<string, unknown> = { ...actual }
  for (const [name, value] of Object.entries(actual)) {
    if (value && typeof value === "object" && typeof (value as { limit?: unknown }).limit === "function") {
      mocked[name] = {
        limit: vi.fn(async () => ({ success: true, limit: 0, remaining: 0, reset: 0, pending: Promise.resolve() })),
      }
    }
  }
  mocked.runThrottled = vi.fn(async () => undefined)
  return mocked
})

// No session unless a test sets one: vi.mocked(auth).mockResolvedValue(...).
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}))
