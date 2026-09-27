import type { NextAuthConfig } from "next-auth"

const USER_RESTRICTED = ["/admin/dashboard", "/admin/scan", "/admin/logs", "/admin/settings", "/admin/admins"]

function isUserRestrictedPath(pathname: string) {
  if (USER_RESTRICTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true
  // Block /admin/events/[id]/edit, /participants, /scan
  if (/^\/admin\/events\/[^/]+\/(edit|participants|scan)(\/|$)/.test(pathname)) return true
  return false
}

function isAdminRestrictedPath(pathname: string) {
  // SUPER_ADMIN only: create or edit events
  if (pathname === "/admin/events/new") return true
  if (/^\/admin\/events\/[^/]+\/edit(\/|$)/.test(pathname)) return true
  return false
}

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const role = (auth?.user as { role?: string })?.role
      const isAdminRoute = nextUrl.pathname.startsWith("/admin")
      const isLoginRoute = nextUrl.pathname === "/login" || nextUrl.pathname === "/"

      if (isAdminRoute) {
        if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl))

        // SUPER_ADMIN only paths — block ADMIN and USER
        if (role !== "SUPER_ADMIN" && isAdminRestrictedPath(nextUrl.pathname)) {
          return Response.redirect(new URL("/admin/events", nextUrl))
        }

        // USER role cannot access admin-only pages
        if (role === "USER" && isUserRestrictedPath(nextUrl.pathname)) {
          return Response.redirect(new URL("/admin/events", nextUrl))
        }

        return true
      }

      if (isLoginRoute && isLoggedIn) {
        return Response.redirect(
          new URL(role === "USER" ? "/admin/events" : "/admin/dashboard", nextUrl)
        )
      }

      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.username = user.name as string
        token.loginAt = Date.now()
      }
      // The middleware re-issues the session cookie with a fresh expiry on every
      // request, so maxAge alone would let an active session — including one
      // whose account has since been deactivated — live forever. A session
      // therefore ends 24 h after sign-in however busy it is. Tokens issued
      // before this rule are stamped the first time they are seen.
      if (typeof token.loginAt !== "number") token.loginAt = Date.now()
      if (Date.now() - (token.loginAt as number) > SESSION_MAX_AGE_SECONDS * 1000) return null
      return token
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as import("@prisma/client").AdminRole
        session.user.username = token.username as string
      }
      return session
    },
  },
  providers: [],
}
