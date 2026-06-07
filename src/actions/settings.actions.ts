"use server"

import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/activity-logger"
import { getSettings, upsertSettings } from "@/repositories/settings.repository"
import { settingsSchema } from "@/validators/settings.validator"
import type { ActionResult } from "@/types"
import type { Settings } from "@prisma/client"

async function getSession() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return {
    username: (session.user as { username?: string }).username ?? "unknown",
    role: (session.user as { role?: string }).role ?? "ADMIN",
  }
}

export async function getSettingsAction(): Promise<Settings> {
  return getSettings()
}

export async function updateSettingsAction(
  formData: Record<string, unknown>
): Promise<ActionResult<Settings>> {
  const session = await getSession()
  if (session.role === "USER") return { success: false, error: "Forbidden" }

  const parsed = settingsSchema.safeParse(formData)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    const first = Object.values(errors)[0]?.[0]
    return { success: false, error: first ?? "Validation failed" }
  }

  const cleanData: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    cleanData[key] = value === "" ? null : (value as string | null) ?? null
  }
  if (parsed.data.companyName) cleanData.companyName = parsed.data.companyName

  try {
    const settings = await upsertSettings(cleanData)

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "SETTINGS_UPDATED",
      entity: "Settings",
      description: "Updated company settings",
    })

    revalidatePath("/admin/settings")
    return { success: true, data: settings }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update settings"
    return { success: false, error: msg }
  }
}
