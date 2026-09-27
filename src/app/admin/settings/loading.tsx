import { Skeleton } from "@/components/ui/skeleton"
import { FormSkeleton } from "@/components/shared/skeleton-loaders"

export default function SettingsLoading() {
  return (
    <div className="space-y-6 max-w-2xl" role="status" aria-label="Loading settings">
      <div className="space-y-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <FormSkeleton fields={6} />
    </div>
  )
}
