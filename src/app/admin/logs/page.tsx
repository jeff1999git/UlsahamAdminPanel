import { Suspense } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Pagination } from "@/components/shared/data-table"
import { TableSkeleton } from "@/components/shared/skeleton-loaders"
import { listActivityLogs, pruneOldActivityLogs } from "@/repositories/activity-log.repository"
import { LogsFeed } from "@/components/admin/logs-feed"
import { LOG_ACTION_LABELS } from "@/constants"
import type { LogAction } from "@prisma/client"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Activity Logs" }

interface SearchParams {
  page?: string
  search?: string
  action?: string
}

async function LogsContent({ params }: { params: SearchParams }) {
  // Fire-and-forget: hard-delete logs older than 30 days
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

      <form method="GET" className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black" />
          <Input
            name="search"
            placeholder="Search by admin username..."
            defaultValue={params.search}
            className="pl-9"
          />
        </div>
        <Select name="action" defaultValue={params.action ?? "all"}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {Object.entries(LOG_ACTION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <Suspense fallback={<TableSkeleton rows={10} cols={1} />}>
        <LogsContent params={params} />
      </Suspense>
    </div>
  )
}
