// The login form's server action. After signIn succeeds it picks the landing
// page from the role in the database: auth() in the same request cannot see
// the new session cookie, so it used to send every USER through the
// dashboard redirect. signIn's errors come back as the form's state.
import type { Mock } from "vitest"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { auth, signIn } from "@/lib/auth"
import { loginAction } from "@/actions/auth.actions"

const m = vi.hoisted(() => ({
  AuthError: class AuthError extends Error {
    constructor(public type: string) {
      super(type)
    }
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  findAdminRoleByUsername: vi.fn(),
  logActivity: vi.fn(async () => undefined),
}))

vi.mock("next/navigation", () => ({ redirect: m.redirect }))
// next-auth's ESM build does not load in plain Node; the action needs only AuthError.
vi.mock("next-auth", () => ({ AuthError: m.AuthError }))
vi.mock("@/repositories/admin.repository", () => ({ findAdminRoleByUsername: m.findAdminRoleByUsername }))
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.logActivity }))

const signInMock = signIn as unknown as Mock
const authMock = auth as unknown as Mock

function credentials(username: string, password: string) {
  const data = new FormData()
  data.set("username", username)
  data.set("password", password)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  signInMock.mockResolvedValue("/admin/dashboard")
})

describe("loginAction after a successful sign-in", () => {
  it.each([
    ["USER", "/admin/events"],
    ["ADMIN", "/admin/dashboard"],
    ["SUPER_ADMIN", "/admin/dashboard"],
  ])("sends %s straight to %s", async (role, target) => {
    m.findAdminRoleByUsername.mockResolvedValue({ role })

    await expect(loginAction(null, credentials("staff", "secret-pw"))).rejects.toThrow(`NEXT_REDIRECT ${target}`)

    expect(signInMock).toHaveBeenCalledWith("credentials", {
      username: "staff",
      password: "secret-pw",
      redirect: false,
    })
    expect(m.findAdminRoleByUsername).toHaveBeenCalledWith("staff")
    expect(m.redirect).toHaveBeenCalledTimes(1)
    // The session is not readable yet, and authorize() writes the LOGIN row.
    expect(authMock).not.toHaveBeenCalled()
    expect(m.logActivity).not.toHaveBeenCalled()
  })

  it("falls back to the dashboard (the middleware reroutes a USER) when the role lookup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    m.findAdminRoleByUsername.mockRejectedValue(new Error("database unreachable"))

    await expect(loginAction(null, credentials("staff", "secret-pw"))).rejects.toThrow(
      "NEXT_REDIRECT /admin/dashboard"
    )
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe("loginAction when signIn fails", () => {
  it.each([
    ["CredentialsSignin", "Invalid username or password."],
    ["CallbackRouteError", "Authentication failed. Please try again."],
  ])("%s returns the error to the form and keeps the username", async (type, message) => {
    signInMock.mockRejectedValue(new m.AuthError(type))

    const state = await loginAction(null, credentials("staff", "wrong-pw"))

    expect(state).toEqual({ success: false, error: message, username: "staff" })
    expect(m.findAdminRoleByUsername).not.toHaveBeenCalled()
    expect(m.redirect).not.toHaveBeenCalled()
  })

  it("an unexpected error returns a generic message", async () => {
    signInMock.mockRejectedValue(new Error("boom"))

    const state = await loginAction(null, credentials("staff", "secret-pw"))

    expect(state).toEqual({ success: false, error: "An unexpected error occurred.", username: "staff" })
    expect(m.redirect).not.toHaveBeenCalled()
  })
})
