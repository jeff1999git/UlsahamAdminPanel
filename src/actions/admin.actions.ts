"use server"

import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { auth } from "@/lib/auth"
import { createAdminSchema, resetPasswordSchema } from "@/validators/admin.validator"
import {
  findAdminByUsername,
  createAdminAccount,
  toggleAdminActive,
  updateAdminPassword,
  deleteAdminAccount,
  findAdminById,
} from "@/repositories/admin.repository"
import { logActivity } from "@/lib/activity-logger"
import type { ActionResult } from "@/types"

const BCRYPT_ROUNDS = 12

async function requireSuperAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized: Super Admin access required")
  }
  return session.user
}

export async function createAdminAction(
  formData: FormData
): Promise<ActionResult<{ username: string }>> {
  try {
    const user = await requireSuperAdmin()

    const raw = {
      username: formData.get("username"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    }

    const parsed = createAdminSchema.safeParse(raw)
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors
      const msg = (Object.values(errors) as (string[] | undefined)[])[0]?.[0] ?? "Validation failed"
      return { success: false, error: msg }
    }

    const { username, password } = parsed.data

    const existing = await findAdminByUsername(username)
    if (existing) {
      return { success: false, error: "Username already taken" }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const admin = await createAdminAccount({ username, passwordHash })

    await logActivity({
      adminUsername: user.username!,
      adminRole: user.role!,
      action: "ADMIN_CREATED",
      entity: "Admin",
      entityId: admin.id,
      description: `Created admin account: ${username}`,
      metadata: { username },
    })

    revalidatePath("/admin/admins")
    return { success: true, data: { username: admin.username } }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message }
    }
    console.error("createAdminAction error:", error)
    return { success: false, error: "Failed to create admin account" }
  }
}

export async function toggleAdminActiveAction(
  adminId: string,
  isActive: boolean
): Promise<ActionResult<void>> {
  try {
    const user = await requireSuperAdmin()

    const admin = await findAdminById(adminId)
    if (!admin) return { success: false, error: "Admin not found" }
    if (admin.role === "SUPER_ADMIN") {
      return { success: false, error: "Cannot modify a Super Admin account" }
    }

    await toggleAdminActive(adminId, isActive)

    await logActivity({
      adminUsername: user.username!,
      adminRole: user.role!,
      action: "ADMIN_UPDATED",
      entity: "Admin",
      entityId: adminId,
      description: `${isActive ? "Activated" : "Deactivated"} admin account: ${admin.username}`,
      metadata: { isActive },
    })

    revalidatePath("/admin/admins")
    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message }
    }
    console.error("toggleAdminActiveAction error:", error)
    return { success: false, error: "Failed to update admin account" }
  }
}

export async function resetAdminPasswordAction(
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const user = await requireSuperAdmin()

    const raw = {
      adminId: formData.get("adminId"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    }

    const parsed = resetPasswordSchema.safeParse(raw)
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors
      const msg = (Object.values(errors) as (string[] | undefined)[])[0]?.[0] ?? "Validation failed"
      return { success: false, error: msg }
    }

    const { adminId, newPassword } = parsed.data

    const admin = await findAdminById(adminId)
    if (!admin) return { success: false, error: "Admin not found" }
    if (admin.role === "SUPER_ADMIN") {
      return { success: false, error: "Cannot modify a Super Admin account" }
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await updateAdminPassword(adminId, passwordHash)

    await logActivity({
      adminUsername: user.username!,
      adminRole: user.role!,
      action: "ADMIN_UPDATED",
      entity: "Admin",
      entityId: adminId,
      description: `Reset password for admin: ${admin.username}`,
    })

    revalidatePath("/admin/admins")
    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message }
    }
    console.error("resetAdminPasswordAction error:", error)
    return { success: false, error: "Failed to reset password" }
  }
}

export async function deleteAdminAction(adminId: string): Promise<ActionResult<void>> {
  try {
    const user = await requireSuperAdmin()

    const admin = await findAdminById(adminId)
    if (!admin) return { success: false, error: "Admin not found" }
    if (admin.role === "SUPER_ADMIN") {
      return { success: false, error: "Cannot delete a Super Admin account" }
    }

    await deleteAdminAccount(adminId)

    await logActivity({
      adminUsername: user.username!,
      adminRole: user.role!,
      action: "ADMIN_DELETED",
      entity: "Admin",
      entityId: adminId,
      description: `Deleted admin account: ${admin.username}`,
      metadata: { username: admin.username },
    })

    revalidatePath("/admin/admins")
    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message }
    }
    console.error("deleteAdminAction error:", error)
    return { success: false, error: "Failed to delete admin account" }
  }
}
