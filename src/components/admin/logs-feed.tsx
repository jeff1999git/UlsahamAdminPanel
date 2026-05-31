"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ChevronRight, User, Clock, Monitor, Tag, FileText } from "lucide-react"
import { LOG_ACTION_LABELS } from "@/constants"

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

export type SerializedLog = {
  id: string
  adminUsername: string
  adminRole: string
  action: string
  entity: string
  entityId: string | null
  description: string
  ipAddress: string
  createdAt: string
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

export function LogsFeed({ logs }: { logs: SerializedLog[] }) {
  const [selected, setSelected] = useState<SerializedLog | null>(null)

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-black">
              No activity logs found.
            </div>
          ) : (
            <ul className="divide-y divide-border" aria-label="Activity logs">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="px-4 py-3 flex items-center gap-3 cursor-pointer active:bg-black/5 hover:bg-black/5 transition-colors"
                  onClick={() => setSelected(log)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setSelected(log)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={actionVariantMap[log.action] ?? "muted"}
                        className="text-xs shrink-0"
                      >
                        {LOG_ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                      <span className="text-xs text-black font-medium truncate">
                        {log.adminUsername}
                      </span>
                    </div>
                    <p className="text-sm text-black mt-0.5 truncate">{log.description}</p>
                    <p className="text-xs text-black/60 mt-0.5">{formatDateTime(log.createdAt)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-black/30 shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        {selected && (
          <DialogContent className="max-w-sm mx-auto">
            <DialogHeader>
              <DialogTitle className="text-black">Log Detail</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              {/* Action badge */}
              <Badge
                variant={actionVariantMap[selected.action] ?? "muted"}
                className="text-sm px-3 py-1"
              >
                {LOG_ACTION_LABELS[selected.action] ?? selected.action}
              </Badge>

              {/* Description */}
              <div className="flex gap-3">
                <FileText className="h-4 w-4 text-black/50 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-black/50 mb-0.5">Description</p>
                  <p className="text-sm text-black leading-snug">{selected.description}</p>
                </div>
              </div>

              {/* Admin */}
              <div className="flex gap-3">
                <User className="h-4 w-4 text-black/50 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-black/50 mb-0.5">Admin</p>
                  <p className="text-sm font-medium text-black">{selected.adminUsername}</p>
                  <p className="text-xs text-black/60">
                    {selected.adminRole === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
                  </p>
                </div>
              </div>

              {/* Timestamp */}
              <div className="flex gap-3">
                <Clock className="h-4 w-4 text-black/50 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-black/50 mb-0.5">Timestamp</p>
                  <p className="text-sm text-black">{formatDateTime(selected.createdAt)}</p>
                </div>
              </div>

              {/* Entity */}
              <div className="flex gap-3">
                <Tag className="h-4 w-4 text-black/50 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-black/50 mb-0.5">Entity</p>
                  <p className="text-sm text-black capitalize">{selected.entity.toLowerCase().replace(/_/g, " ")}</p>
                  {selected.entityId && (
                    <p className="text-xs text-black/50 font-mono mt-0.5 break-all">{selected.entityId}</p>
                  )}
                </div>
              </div>

              {/* IP */}
              <div className="flex gap-3">
                <Monitor className="h-4 w-4 text-black/50 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-black/50 mb-0.5">IP Address</p>
                  <p className="text-sm text-black font-mono">{selected.ipAddress}</p>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
