"use client"

import { useState, useTransition, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ChevronRight,
  Pencil,
  Trash2,
  Users,
  QrCode,
  Eye,
  EyeOff,
  Calendar,
  MapPin,
  DollarSign,
  UserPlus,
  CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EventStatusBadge } from "@/components/events/event-status-badge"
import { TableEmpty } from "@/components/shared/data-table"
import { EnrollDialog } from "@/components/participants/enroll-dialog"
import { deleteEventAction, toggleEventStatusAction } from "@/actions/event.actions"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { EventWithParticipantCount } from "@/types/event.types"

function participantCount(event: EventWithParticipantCount): number {
  return event._count.participants || (event as unknown as { archivedParticipantCount: number }).archivedParticipantCount || 0
}

interface EventTableProps {
  events: EventWithParticipantCount[]
  isUser?: boolean
}

const ENROLL_STORAGE_KEY = "ulsaham_user_enrollments"

export function EventTable({ events, isUser = false }: EventTableProps) {
  const [selected, setSelected] = useState<EventWithParticipantCount | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [enrollEvent, setEnrollEvent] = useState<EventWithParticipantCount | null>(null)
  const [enrolledEventIds, setEnrolledEventIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!isUser) return
    try {
      const stored = localStorage.getItem(ENROLL_STORAGE_KEY)
      if (stored) setEnrolledEventIds(new Set(JSON.parse(stored) as string[]))
    } catch {}
  }, [isUser])

  function handleEnrolled(eventId: string) {
    setEnrolledEventIds((prev) => {
      const next = new Set(prev)
      next.add(eventId)
      try {
        localStorage.setItem(ENROLL_STORAGE_KEY, JSON.stringify([...next]))
      } catch {}
      return next
    })
    setEnrollEvent(null)
  }

  function handleToggleStatus() {
    if (!selected) return
    const newStatus = selected.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"
    startTransition(async () => {
      const result = await toggleEventStatusAction(selected.id, newStatus as "PUBLISHED" | "DRAFT")
      if (result.success) {
        toast.success(`Event ${newStatus === "PUBLISHED" ? "published" : "unpublished"}`)
        setSelected(null)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete() {
    if (!selected) return
    startTransition(async () => {
      const result = await deleteEventAction(selected.id)
      if (result.success) {
        toast.success("Event deleted")
        setConfirmDelete(false)
        setSelected(null)
      } else {
        toast.error(result.error)
      }
    })
  }

  if (events.length === 0) {
    return (
      <TableEmpty message="No events found" description="Create your first event to get started." />
    )
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border" aria-label="Events list">
            {events.map((event) => (
              <li
                key={event.id}
                className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-black/5 active:bg-black/5 transition-colors"
                onClick={() => setSelected(event)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setSelected(event)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-black text-sm truncate">{event.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-black/60">{formatDate(event.date)}</span>
                    {!isUser && (
                      <>
                        <span className="text-xs text-black/40">·</span>
                        <span className="text-xs text-black/60">
                          {participantCount(event)} participant{participantCount(event) !== 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                    {isUser && enrolledEventIds.has(event.id) && (
                      <span className="text-xs text-[#014421] font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Enrolled
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-black/30 shrink-0" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Event detail modal */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <DialogContent className="max-w-sm mx-auto p-0 overflow-hidden gap-0">
            {/* Banner image */}
            {selected.bannerImageUrl ? (
              <div className="relative w-full h-48 shrink-0">
                <Image
                  src={selected.bannerImageUrl}
                  alt={selected.name}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-full h-16 bg-[#014421]/10" />
            )}

            <div className="p-5 space-y-4">
              <DialogHeader className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <DialogTitle className="text-black text-base leading-snug">
                    {selected.name}
                  </DialogTitle>
                  <EventStatusBadge status={selected.status} />
                </div>
              </DialogHeader>

              {/* Details */}
              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 text-black/40 mt-0.5 shrink-0" />
                  <span className="text-sm text-black">{selected.venue}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 text-black/40 shrink-0" />
                  <span className="text-sm text-black">
                    {formatDate(selected.date)}
                    {selected.startTime && ` · ${selected.startTime}`}
                    {selected.endTime && ` – ${selected.endTime}`}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <DollarSign className="h-4 w-4 text-black/40 shrink-0" />
                  {selected.isFree ? (
                    <span className="text-sm font-medium text-[#014421]">Free</span>
                  ) : (
                    <span className="text-sm text-black">{formatCurrency(selected.amount ?? 0)}</span>
                  )}
                </div>
                {!isUser && (
                  <div className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 text-black/40 shrink-0" />
                    <span className="text-sm text-black">
                      {participantCount(selected)} registered
                      {selected.capacity ? ` / ${selected.capacity} capacity` : ""}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border-t pt-4 space-y-2">
                <div className={`grid gap-2 ${isUser ? "grid-cols-1" : "grid-cols-3"}`}>
                  {!isUser && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/events/${selected.id}/edit`}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                      </Link>
                    </Button>
                  )}
                  {isUser ? (
                    enrolledEventIds.has(selected.id) ? (
                      <Button size="sm" variant="outline" disabled className="opacity-60 cursor-not-allowed">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-[#014421]" />
                        Enrolled
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#014421] text-[#014421] hover:bg-[#014421]/5"
                        onClick={() => {
                          setEnrollEvent(selected)
                          setSelected(null)
                        }}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        Enroll
                      </Button>
                    )
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/events/${selected.id}/participants`}>
                        <Users className="h-3.5 w-3.5 mr-1.5" />
                        Guests
                      </Link>
                    </Button>
                  )}
                  {!isUser && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/events/${selected.id}/scan`}>
                        <QrCode className="h-3.5 w-3.5 mr-1.5" />
                        Scan
                      </Link>
                    </Button>
                  )}
                </div>

                {!isUser && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={handleToggleStatus}
                    >
                      {selected.status === "PUBLISHED" ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5 mr-2" />
                          Unpublish
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5 mr-2" />
                          Publish
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete Event
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Enroll dialog for USER role */}
      {isUser && (
        <EnrollDialog
          eventId={enrollEvent?.id ?? ""}
          eventName={enrollEvent?.name ?? ""}
          isFree={enrollEvent?.isFree ?? true}
          amount={enrollEvent?.amount ?? null}
          open={!!enrollEvent}
          onOpenChange={(open) => { if (!open) setEnrollEvent(null) }}
          onEnrolled={() => handleEnrolled(enrollEvent?.id ?? "")}
        />
      )}

      {/* Delete confirmation — separate portal, overlays the detail dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              {selected && participantCount(selected) > 0
                ? `This event has ${participantCount(selected)} participant(s). It will be marked as Cancelled instead of deleted.`
                : "Are you sure you want to delete this event? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
