import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import type { LogAction, AdminRole } from "@prisma/client"

interface LogActivityParams {
  adminUsername: string
  adminRole: AdminRole | string
  action: LogAction
  entity: string
  entityId?: string
  description: string
  metadata?: Record<string, unknown>
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const headersList = await headers()
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headersList.get("x-real-ip") ??
      "unknown"

    await prisma.activityLog.create({
      data: {
        adminUsername: params.adminUsername,
        adminRole: params.adminRole,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        description: params.description,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonObject,
        ipAddress: ip,
      },
    })
  } catch (error) {
    // Non-fatal: activity logging should never break the main flow
    console.error("Failed to log activity:", error)
  }
}
