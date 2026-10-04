// The credentials provider's authorize() in src/lib/auth.ts. A good password
// stamps lastLoginAt and then writes the LOGIN activity row. Unknown and
// inactive usernames still pay for one bcrypt compare, against a fixed
// cost-12 hash, so they take as long to refuse as a wrong password.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Authorize = (credentials: unknown) => Promise<unknown>

const m = vi.hoisted(() => ({
  config: undefined as undefined | { providers: Array<{ authorize: Authorize }> },
  findUnique: vi.fn(),
  update: vi.fn(async () => undefined),
  compare: vi.fn(),
  logActivity: vi.fn(async () => undefined),
}))

// NextAuth() and Credentials() are replaced so the real config object, with
// its authorize(), is captured. next-auth's ESM build does not load in plain Node.
vi.mock("next-auth", () => ({
  default: (config: typeof m.config) => {
    m.config = config
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }
  },
}))
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }))
vi.mock("@/lib/prisma", () => ({ prisma: { admin: { findUnique: m.findUnique, update: m.update } } }))
vi.mock("bcryptjs", () => ({ default: { compare: m.compare } }))
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.logActivity }))

// test/setup.ts mocks @/lib/auth for every other file; this one needs the real module.
await vi.importActual("@/lib/auth")
const authorize = m.config!.providers[0].authorize
const realBcrypt = await vi.importActual<{ default: { getRounds(hash: string): number } }>("bcryptjs")

const STAFF = {
  id: "adm1",
  username: "staff",
  role: "ADMIN",
  isActive: true,
  passwordHash: "staff-password-hash",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("authorize", () => {
  it("signs in an active admin, stamps lastLoginAt, then logs LOGIN", async () => {
    m.findUnique.mockResolvedValue(STAFF)
    m.compare.mockResolvedValue(true)

    const user = await authorize({ username: "staff", password: "right-pw" })

    expect(user).toEqual({ id: "adm1", name: "staff", email: null, role: "ADMIN" })
    expect(m.compare).toHaveBeenCalledWith("right-pw", STAFF.passwordHash)
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "adm1" },
      data: { lastLoginAt: expect.any(Date) },
    })
    expect(m.logActivity).toHaveBeenCalledTimes(1)
    expect(m.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUsername: "staff",
        adminRole: "ADMIN",
        action: "LOGIN",
        entity: "Admin",
        entityId: "adm1",
      })
    )
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(m.logActivity.mock.invocationCallOrder[0])
  })

  it("refuses a wrong password without stamping or logging", async () => {
    m.findUnique.mockResolvedValue(STAFF)
    m.compare.mockResolvedValue(false)

    expect(await authorize({ username: "staff", password: "wrong-pw" })).toBeNull()
    expect(m.compare).toHaveBeenCalledTimes(1)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.logActivity).not.toHaveBeenCalled()
  })

  it("still runs one bcrypt compare, against a cost-12 hash, for an unknown username", async () => {
    m.findUnique.mockResolvedValue(null)
    m.compare.mockResolvedValue(false)

    expect(await authorize({ username: "nobody", password: "any-pw" })).toBeNull()
    expect(m.compare).toHaveBeenCalledTimes(1)
    const [password, hash] = m.compare.mock.calls[0] as [string, string]
    expect(password).toBe("any-pw")
    // getRounds throws on anything that is not a bcrypt hash.
    expect(realBcrypt.default.getRounds(hash)).toBe(12)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.logActivity).not.toHaveBeenCalled()
  })

  it("compares an inactive admin against the same dummy hash, never its own, and refuses", async () => {
    m.findUnique.mockResolvedValueOnce(null)
    m.compare.mockResolvedValue(true)
    await authorize({ username: "nobody", password: "right-pw" })
    const dummyHash = m.compare.mock.calls[0][1]

    m.compare.mockClear()
    m.findUnique.mockResolvedValueOnce({ ...STAFF, isActive: false })
    expect(await authorize({ username: "staff", password: "right-pw" })).toBeNull()
    expect(m.compare).toHaveBeenCalledTimes(1)
    expect(m.compare).toHaveBeenCalledWith("right-pw", dummyHash)
    expect(dummyHash).not.toBe(STAFF.passwordHash)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.logActivity).not.toHaveBeenCalled()
  })

  it("refuses empty credentials before reaching the database", async () => {
    expect(await authorize({ username: "", password: "" })).toBeNull()
    expect(m.findUnique).not.toHaveBeenCalled()
  })
})
