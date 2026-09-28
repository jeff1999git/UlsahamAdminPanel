import Link from "next/link"
import { SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"

// notFound() from an admin page lands here, inside the admin layout.
export default function AdminNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <SearchX className="h-10 w-10 text-black/40" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-black">Not found</h1>
        <p className="text-sm text-black/60 max-w-sm">
          This event or page does not exist. It may have been deleted.
        </p>
      </div>
      <Button asChild>
        <Link href="/admin/events">Back to Events</Link>
      </Button>
    </div>
  )
}
