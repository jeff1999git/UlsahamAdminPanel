import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

/** Same box as StatsCard: title, value, description and the icon tile. */
export function StatsCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-14 mt-1" />
            <Skeleton className="h-4 w-24 mt-1" />
          </div>
          <Skeleton className="w-10 h-10 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  )
}

/** `toolbar`: the search and filter row that list pages have above the table. */
export function TableSkeleton({
  rows = 5,
  cols = 5,
  toolbar = true,
}: {
  rows?: number
  cols?: number
  toolbar?: boolean
}) {
  return (
    <div className="space-y-3">
      {toolbar && (
        <div className="flex gap-4 items-center">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
      )}
      <div className="border rounded-lg overflow-hidden">
        <div className="border-b bg-muted/30 flex">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-10 flex-1 m-2 rounded" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex border-b last:border-0">
            {Array.from({ length: cols }).map((_, col) => (
              <Skeleton key={col} className="h-8 flex-1 m-3 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  )
}

/**
 * Mirrors the dashboard: its stat cards (5 for super admins, else 4), the
 * quick-action buttons and the recent-activity list, so nothing shifts when
 * the data arrives.
 */
export function DashboardSkeleton({ cards = 5 }: { cards?: 4 | 5 }) {
  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-4 ${cards === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {Array.from({ length: cards }).map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="max-w-2xl space-y-3">
        <Skeleton className="h-7 w-36" />
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-6 py-3 space-y-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-32" />
    </div>
  )
}
