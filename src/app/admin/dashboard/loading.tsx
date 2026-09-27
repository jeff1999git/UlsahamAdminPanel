import { DashboardSkeleton } from "@/components/shared/skeleton-loaders"

export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <DashboardSkeleton />
    </div>
  )
}
