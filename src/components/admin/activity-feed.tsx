import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/utils"
import { LOG_ACTION_LABELS } from "@/constants"
import type { ActivityLog } from "@prisma/client"

interface ActivityFeedProps {
  logs: ActivityLog[]
}

const actionVariantMap: Record<string, "default" | "secondary" | "destructive" | "success" | "warning" | "info" | "muted"> = {
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

export function ActivityFeed({ logs }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-black">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-black">
            No activity yet.
          </div>
        ) : (
          <ul className="divide-y divide-border" aria-label="Recent activity feed">
            {logs.map((log) => (
              <li key={log.id} className="px-6 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={actionVariantMap[log.action] ?? "muted"} className="text-xs">
                      {LOG_ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                    <span className="text-xs text-black font-medium">
                      {log.adminUsername}
                    </span>
                  </div>
                  <p className="text-sm text-black mt-0.5 truncate">{log.description}</p>
                  <p className="text-xs text-black mt-0.5">
                    <time dateTime={log.createdAt.toISOString()}>
                      {formatDateTime(log.createdAt)}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
