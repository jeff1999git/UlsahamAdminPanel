import { Skeleton } from "@/components/ui/skeleton"
import { FormSkeleton } from "@/components/shared/skeleton-loaders"

export default function EditEventLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading event">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <FormSkeleton fields={8} />
    </div>
  )
}
