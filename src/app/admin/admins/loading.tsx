import { PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeleton-loaders"

export default function AdminsLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading accounts">
      <PageHeaderSkeleton />
      <TableSkeleton rows={4} cols={5} toolbar={false} />
    </div>
  )
}
