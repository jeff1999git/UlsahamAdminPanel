"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { toggleEventStatusAction, deleteEventAction } from "@/actions/event.actions"
import type { EventStatus } from "@prisma/client"

interface EventEditActionsProps {
  eventId: string
  status: EventStatus
  participantCount: number
}

export function EventEditActions({ eventId, status, participantCount }: EventEditActionsProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const canToggle = status !== "CANCELLED" && status !== "COMPLETED"
  const isPublished = status === "PUBLISHED"

  function handleToggleStatus() {
    const newStatus = isPublished ? "ANNOUNCED" : "PUBLISHED"
    startTransition(async () => {
      const result = await toggleEventStatusAction(eventId, newStatus as EventStatus)
      if (result.success) {
        toast.success(newStatus === "PUBLISHED" ? "Event published" : "Event unpublished")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  async function handleDelete() {
    const result = await deleteEventAction(eventId)
    if (result.success) {
      toast.success("Event deleted")
      router.push("/admin/events")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canToggle && (
        <Button size="sm" variant="outline" onClick={handleToggleStatus}>
          {isPublished ? (
            <>
              <EyeOff className="h-4 w-4 mr-1.5" />
              Unpublish
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-1.5" />
              Publish
            </>
          )}
        </Button>
      )}
      <ConfirmDialog
        trigger={
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete Event
          </Button>
        }
        title="Delete Event"
        description={
          participantCount > 0
            ? `This event has ${participantCount} participant(s). It will be marked as Cancelled instead of deleted.`
            : "Are you sure you want to delete this event? This action cannot be undone."
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  )
}
