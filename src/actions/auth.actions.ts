"use server"

import { signIn, signOut, auth } from "@/lib/auth"
import { AuthError } from "next-auth"
import { logActivity } from "@/lib/activity-logger"
import { redirect } from "next/navigation"

export async function loginAction(data: {
  username: string
  password: string
}): Promise<{ success: false; error: string } | never> {
  try {
    await signIn("credentials", {
      username: data.username,
      password: data.password,
      redirect: false,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { success: false, error: "Invalid username or password." }
        default:
          return { success: false, error: "Authentication failed. Please try again." }
      }
    }
    return { success: false, error: "An unexpected error occurred." }
  }

  const session = await auth()
  if (session?.user) {
    await logActivity({
      adminUsername: session.user.username ?? session.user.name ?? "unknown",
      adminRole: session.user.role ?? "ADMIN",
      action: "LOGIN",
      entity: "Admin",
      description: `${session.user.username ?? session.user.name} logged in`,
    })

    if (session.user.role === "USER") {
      redirect("/admin/events")
    }
  }

  redirect("/admin/dashboard")
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
