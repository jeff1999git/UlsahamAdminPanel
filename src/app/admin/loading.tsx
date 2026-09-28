import { PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeleton-loaders"

// Shown inside the admin layout the moment a link is tapped, until the page's
// data arrives. Pages with a different shape have their own loading.tsx.
export default function AdminLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} cols={1} />
    </div>
  )
}
