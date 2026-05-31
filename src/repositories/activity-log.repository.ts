import { prisma } from "@/lib/prisma"
import type { LogAction, Prisma } from "@prisma/client"
import { LOGS_PAGE_SIZE } from "@/constants"

export type ActivityLogListParams = {
  page?: number
  limit?: number
  action?: LogAction | ""
  adminUsername?: string
  dateFrom?: Date
  dateTo?: Date
}

export async function listActivityLogs(params: ActivityLogListParams = {}) {
  const {
    page = 1,
    limit = LOGS_PAGE_SIZE,
    action,
    adminUsername,
    dateFrom,
    dateTo,
  } = params

  const where: Prisma.ActivityLogWhereInput = {}

  if (action) where.action = action as LogAction
  if (adminUsername) where.adminUsername = { contains: adminUsername, mode: "insensitive" }

  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = dateFrom
    if (dateTo) where.createdAt.lte = dateTo
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ])

  return { logs, total, page, totalPages: Math.ceil(total / limit) }
}

export async function getRecentActivityLogs(limit = 10) {
  return prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}
