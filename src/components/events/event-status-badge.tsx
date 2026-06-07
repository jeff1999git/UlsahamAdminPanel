import { Badge } from "@/components/ui/badge"
import type { EventStatus } from "@prisma/client"

const statusConfig: Record<
  EventStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" | "muted" }
> = {
  ANNOUNCED: { label: "Announced", variant: "warning" },
  PUBLISHED: { label: "Published", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
  COMPLETED: { label: "Completed", variant: "secondary" },
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
