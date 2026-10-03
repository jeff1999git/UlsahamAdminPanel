"use server"

import { signIn, signOut, auth } from "@/lib/auth"
import { AuthError } from "next-auth"
import { logActivity } from "@/lib/activity-logger"
import { findAdminRoleByUsername } from "@/repositories/admin.repository"
import { redirect } from "next/navigation"
import type { AdminRole } from "@prisma/client"

// `username` goes back to the form, which React clears after every submit.
export type LoginState = { success: false; error: string; username: string } | null

/** The login form's action (useActionState). Redirects on success. */
export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "")
  const password = String(formData.get("password") ?? "")

  try {
    await signIn("credentials", {
      username,
      password,
      redirect: false,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { success: false, error: "Invalid username or password.", username }
        default:
          return { success: false, error: "Authentication failed. Please try again.", username }
      }
    }
    return { success: false, error: "An unexpected error occurred.", username }
  }

  // auth() reads the incoming request's headers, which do not carry the
  // session cookie signIn just set, so the role comes from the database. The
  // LOGIN activity row is written by authorize() in lib/auth.ts. If the lookup
  // fails, the middleware still sends a USER from the dashboard to /admin/events.
  let role: AdminRole | undefined
  try {
    role = (await findAdminRoleByUsername(username))?.role
  } catch (error) {
    console.error("Could not read the role after sign-in:", error)
  }

  redirect(role === "USER" ? "/admin/events" : "/admin/dashboard")
}

export async function logoutAction(): Promise<void> {
  const session = await auth()

  if (session?.user) {
    await logActivity({
      adminUsername: session.user.username ?? "unknown",
      adminRole: session.user.role ?? "ADMIN",
      action: "LOGOUT",
      entity: "Admin",
      description: `${session.user.username} logged out`,
    })
  }

  await signOut({ redirectTo: "/login" })
}
