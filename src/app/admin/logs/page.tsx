import { Suspense } from "react"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { auth } from "@/lib/auth"
import { runThrottled } from "@/lib/ratelimit"
import { parsePositiveInt } from "@/lib/query-params"
import { LOG_ACTION_LABELS } from "@/constants"
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
  // Housekeeping after the page is sent, at most once an hour across instances.
  after(() => runThrottled("prune-activity-logs", 60 * 60, pruneOldActivityLogs))

  // Hand-edited URLs: a non-numeric page reads page 1, and an unknown action
  // lists every action, instead of either reaching Prisma and failing.
  const page = parsePositiveInt(params.page, 1, 1000)
  const search = params.search ?? ""
  const actionParam = params.action ?? ""
  const action = Object.keys(LOG_ACTION_LABELS).includes(actionParam)
    ? (actionParam as LogAction)
    : ""

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
  const session = await auth()
  if ((session?.user as { role?: string })?.role === "USER") redirect("/admin/events")

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

      {/* Keyed by the query, so a new filter or page shows the skeleton
          instead of leaving the old list on screen while it loads. */}
      <Suspense key={JSON.stringify(params)} fallback={<TableSkeleton rows={10} cols={1} toolbar={false} />}>
        <LogsContent params={params} />
      </Suspense>
    </div>
  )
}
