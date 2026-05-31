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
    dateTo,
  } = params

  // Default window: last 30 days (hard limit — older records are pruned anyway)
  const dateFrom = params.dateFrom ?? (() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d
  })()

  const where: Prisma.ActivityLogWhereInput = {}

  if (action) where.action = action as LogAction
  if (adminUsername) where.adminUsername = { contains: adminUsername, mode: "insensitive" }

  where.createdAt = { gte: dateFrom }
  if (dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = dateTo

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

export async function getRecentActivityLogs(limit = 10, days = 15) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  return prisma.activityLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}

export async function pruneOldActivityLogs() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  return prisma.activityLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })
}
