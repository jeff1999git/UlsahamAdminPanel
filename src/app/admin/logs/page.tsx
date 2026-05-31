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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Pagination } from "@/components/shared/data-table"
import { TableSkeleton } from "@/components/shared/skeleton-loaders"
import { listActivityLogs } from "@/repositories/activity-log.repository"
import { formatDateTime } from "@/lib/utils"
import { LOG_ACTION_LABELS } from "@/constants"
import type { LogAction } from "@prisma/client"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Activity Logs" }

interface SearchParams {
  page?: string
  search?: string
  action?: string
}

const actionVariantMap: Record<string, "success" | "destructive" | "info" | "warning" | "muted"> = {
  LOGIN: "success",
  LOGOUT: "muted",
  EVENT_CREATED: "info",
  EVENT_UPDATED: "info",
  EVENT_DELETED: "destructive",
  EVENT_STATUS_CHANGED: "warning",
  PARTICIPANT_ADDED: "success",
  PARTICIPANT_UPDATED: "info",
  PARTICIPANT_DELETED: "destructive",
  ATTENDANCE_MARKED: "success",
  ATTENDANCE_UNMARKED: "warning",
  SETTINGS_UPDATED: "info",
  ADMIN_CREATED: "info",
  ADMIN_UPDATED: "info",
  ADMIN_DELETED: "destructive",
}

async function LogsContent({ params }: { params: SearchParams }) {
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

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-card">
              <TableHead>Timestamp</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>IP Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-black">
                  No activity logs found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-black whitespace-nowrap">
                    <time dateTime={log.createdAt.toISOString()}>
                      {formatDateTime(log.createdAt)}
                    </time>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-black">{log.adminUsername}</p>
                      <p className="text-xs text-black">
                        {log.adminRole === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={actionVariantMap[log.action] ?? "muted"}
                      className="text-xs whitespace-nowrap"
                    >
                      {LOG_ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-black max-w-[300px] truncate">
                    {log.description}
                  </TableCell>
                  <TableCell className="text-xs text-black font-mono whitespace-nowrap">
                    {log.ipAddress}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
        <p className="text-sm text-black mt-1">Read-only audit trail of all admin actions</p>
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

      <Suspense fallback={<TableSkeleton rows={10} cols={5} />}>
        <LogsContent params={params} />
      </Suspense>
    </div>
  )
}
