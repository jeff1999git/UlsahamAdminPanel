// Page gating in the middleware (auth.config.ts callbacks.authorized) for every
// admin page and role, and the 24 h cap the jwt callback puts on a session.
// The pages repeat these checks on the server; this pins the first line.
import { readdirSync } from "node:fs"
import path from "node:path"
import type { Session } from "next-auth"
import type { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authConfig } from "../auth.config"

type Role = "SIGNED_OUT" | "USER" | "ADMIN" | "SUPER_ADMIN"
const ROLES: Role[] = ["SIGNED_OUT", "USER", "ADMIN", "SUPER_ADMIN"]

const ALLOW = "allow"
const TO_LOGIN = "/login"
const TO_EVENTS = "/admin/events"
const TO_DASHBOARD = "/admin/dashboard"

// [path, outcome per role]. "allow" lets the request through; anything else
// is the path the middleware redirects to.
const MATRIX: Array<[string, Record<Role, string>]> = [
  ["/admin/dashboard", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
  ["/admin/events", { SIGNED_OUT: TO_LOGIN, USER: ALLOW, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
  ["/admin/events/new", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: TO_EVENTS, SUPER_ADMIN: ALLOW }],
  ["/admin/events/evt123/edit", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: TO_EVENTS, SUPER_ADMIN: ALLOW }],
  ["/admin/events/evt123/participants", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
  ["/admin/events/evt123/scan", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
  ["/admin/logs", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
  ["/admin/scan", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
  // ADMIN passes the middleware here; the settings and admins pages send it
  // back to /admin/events themselves, and their actions are SUPER_ADMIN only.
  ["/admin/settings", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
  ["/admin/admins", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
  // Restrictions cover a page's sub-paths too.
  ["/admin/logs/older", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
  ["/admin/events/evt123/edit/extra", { SIGNED_OUT: TO_LOGIN, USER: TO_EVENTS, ADMIN: TO_EVENTS, SUPER_ADMIN: ALLOW }],
  ["/login", { SIGNED_OUT: ALLOW, USER: TO_EVENTS, ADMIN: TO_DASHBOARD, SUPER_ADMIN: TO_DASHBOARD }],
  ["/", { SIGNED_OUT: ALLOW, USER: TO_EVENTS, ADMIN: TO_DASHBOARD, SUPER_ADMIN: TO_DASHBOARD }],
  // API routes are not gated here; each checks the session itself.
  ["/api/admin/upload", { SIGNED_OUT: ALLOW, USER: ALLOW, ADMIN: ALLOW, SUPER_ADMIN: ALLOW }],
]

const ORIGIN = "https://admin.ulsaham.test"

function sessionFor(role: Role): Session | null {
  if (role === "SIGNED_OUT") return null
  return {
    user: { id: `id-${role}`, username: role.toLowerCase(), role },
    expires: "2099-01-01T00:00:00.000Z",
  }
}

async function outcome(pathname: string, role: Role): Promise<string> {
  const request = { nextUrl: new URL(pathname, ORIGIN) } as unknown as NextRequest
  const result = await authConfig.callbacks!.authorized!({ auth: sessionFor(role), request })
  if (result === true) return ALLOW
  if (result instanceof Response) {
    expect(result.status).toBe(302)
    const location = new URL(result.headers.get("location")!)
    expect(location.origin).toBe(ORIGIN)
    return location.pathname
  }
  throw new Error(`Unexpected authorized() result for ${pathname}: ${String(result)}`)
}

describe("authorized(): path x role", () => {
  for (const [pathname, expected] of MATRIX) {
    it.each(ROLES)(`${pathname} as %s`, async (role) => {
      expect(await outcome(pathname, role)).toBe(expected[role])
    })
  }

  it("has a row for every admin page", () => {
    const appDir = path.join(__dirname, "..", "src", "app")
    const pages: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name === "page.tsx") pages.push(path.relative(appDir, dir).split(path.sep).join("/"))
      }
    }
    walk(path.join(appDir, "admin"))
    const routes = pages.map((p) => "/" + p.replace(/\[[^\]]+\]/g, "evt123"))
    const covered = new Set(MATRIX.map(([p]) => p))
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.filter((r) => !covered.has(r))).toEqual([])
  })
})

describe("jwt(): 24 h session cap", () => {
  const jwt = authConfig.callbacks!.jwt!
  type JwtParams = Parameters<typeof jwt>[0]
  const NOW = new Date("2026-10-03T10:00:00.000Z").getTime()
  const DAY_MS = 24 * 60 * 60 * 1000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("stamps a fresh sign-in with the user and the sign-in time", async () => {
    const token = await jwt({
      token: {},
      user: { id: "a1", name: "alice", role: "ADMIN" },
      account: null,
    } as JwtParams)
    expect(token).toEqual({ id: "a1", role: "ADMIN", username: "alice", loginAt: NOW })
  })

  it("keeps a session up to exactly 24 h after sign-in", async () => {
    const token = { id: "a1", role: "ADMIN", loginAt: NOW - DAY_MS }
    expect(await jwt({ token, account: null } as unknown as JwtParams)).toBe(token)
  })

  it("ends a session one millisecond past 24 h, however active it is", async () => {
    const token = { id: "a1", role: "ADMIN", loginAt: NOW - DAY_MS - 1 }
    expect(await jwt({ token, account: null } as unknown as JwtParams)).toBeNull()
  })

  it("stamps a token issued before the cap existed the first time it is seen", async () => {
    const token: Record<string, unknown> = { id: "a1", role: "ADMIN" }
    expect(await jwt({ token, account: null } as unknown as JwtParams)).toMatchObject({ loginAt: NOW })

    vi.setSystemTime(NOW + DAY_MS + 1)
    expect(await jwt({ token, account: null } as unknown as JwtParams)).toBeNull()
  })

  it("does not extend the cap on later requests", async () => {
    const token = await jwt({
      token: {},
      user: { id: "a1", name: "alice", role: "USER" },
      account: null,
    } as JwtParams)
    vi.setSystemTime(NOW + DAY_MS / 2)
    const refreshed = await jwt({ token: token!, account: null } as unknown as JwtParams)
    expect(refreshed).toMatchObject({ loginAt: NOW })
    vi.setSystemTime(NOW + DAY_MS + 1)
    expect(await jwt({ token: refreshed!, account: null } as unknown as JwtParams)).toBeNull()
  })

  it("matches the session maxAge", () => {
    expect(authConfig.session?.maxAge).toBe(DAY_MS / 1000)
  })
})

describe("session(): copies the token's identity onto the session", () => {
  const sessionCallback = authConfig.callbacks!.session!

  it("sets id, role and username", async () => {
    const session = await sessionCallback({
      session: { user: { name: "alice" }, expires: "2099-01-01T00:00:00.000Z" },
      token: { id: "a1", role: "SUPER_ADMIN", username: "alice" },
    } as unknown as Parameters<typeof sessionCallback>[0])
    expect(session.user).toMatchObject({ id: "a1", role: "SUPER_ADMIN", username: "alice" })
  })
})
