"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Lock, Unlock, Trash2 } from "lucide-react"
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
  const isBookingClosed = status === "BOOKING_CLOSED"

  function changeStatus(newStatus: EventStatus, successMessage: string) {
    startTransition(async () => {
      const result = await toggleEventStatusAction(eventId, newStatus)
      if (result.success) {
        toast.success(successMessage)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleToggleStatus() {
    changeStatus(
      isPublished ? "ANNOUNCED" : "PUBLISHED",
      isPublished ? "Event unpublished" : "Event published"
    )
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
      {canToggle && !isBookingClosed && (
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
      {canToggle && isPublished && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => changeStatus("BOOKING_CLOSED", "Booking closed — the event stays listed")}
        >
          <Lock className="h-4 w-4 mr-1.5" />
          Close Booking
        </Button>
      )}
      {canToggle && isBookingClosed && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => changeStatus("PUBLISHED", "Booking reopened")}
        >
          <Unlock className="h-4 w-4 mr-1.5" />
          Reopen Booking
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
