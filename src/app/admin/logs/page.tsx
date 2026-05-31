import { Suspense } from "react"
import { Pagination } from "@/components/shared/data-table"
import { TableSkeleton } from "@/components/shared/skeleton-loaders"
import { listActivityLogs, pruneOldActivityLogs } from "@/repositories/activity-log.repository"
import { LogsFeed } from "@/components/admin/logs-feed"
import { LogsFilter } from "@/components/admin/logs-filter"
import type { LogAction } from "@prisma/client"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Activity Logs" }

interface SearchParams {
  page?: string
  search?: string
  action?: string
}

async function LogsContent({ params }: { params: SearchParams }) {
  pruneOldActivityLogs().catch(() => {})

  const page = parseInt(params.page ?? "1")
  const search = params.search ?? ""
  const actionParam = params.action ?? ""
  const action = (actionParam === "all" ? "" : actionParam) as LogAction | ""

  const { logs, total, totalPages } = await listActivityLogs({
    page,
    limit: 20,
    action: action || undefined,
    adminUsername: search || undefined,
  })

  const currentParams: Record<string, string> = {}
  if (search) currentParams.search = search
  if (action) currentParams.action = actionParam

  const serialized = logs.map((log) => ({
    id: log.id,
    adminUsername: log.adminUsername,
    adminRole: log.adminRole,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    description: log.description,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-4">
      <LogsFeed logs={serialized} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-black">{total} log entries</p>
        <Pagination
          page={page}
          totalPages={totalPages}
          baseUrl="/admin/logs"
          searchParams={currentParams}
        />
      </div>
    </div>
  )
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-black">Activity Logs</h1>
        <p className="text-sm text-black mt-1">Read-only audit trail of all admin actions (last 30 days)</p>
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <LogsFilter defaultSearch={params.search} defaultAction={params.action} />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={10} cols={1} />}>
        <LogsContent params={params} />
      </Suspense>
    </div>
  )
}
