"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  QrCode,
  Eye,
  EyeOff,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EventStatusBadge } from "@/components/events/event-status-badge"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { TableEmpty } from "@/components/shared/data-table"
import { deleteEventAction, toggleEventStatusAction } from "@/actions/event.actions"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { EventWithParticipantCount } from "@/types/event.types"

interface EventTableProps {
  events: EventWithParticipantCount[]
}

export function EventTable({ events }: EventTableProps) {
  const [, startTransition] = useTransition()

  function handleToggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === "PUBLISHED" ? "DRAFT" : "PUBLISHED"
    startTransition(async () => {
      const result = await toggleEventStatusAction(id, newStatus as "PUBLISHED" | "DRAFT")
      if (result.success) {
        toast.success(`Event ${newStatus === "PUBLISHED" ? "published" : "unpublished"}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteEventAction(id)
      if (result.success) {
        toast.success("Event deleted")
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
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-card">
            <TableHead>Event</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Participants</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  {event.bannerImageUrl && (
                    <div className="w-10 h-10 rounded overflow-hidden shrink-0 relative">
                      <Image
                        src={event.bannerImageUrl}
                        alt={event.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-black text-sm">{event.name}</p>
                    <p className="text-xs text-black font-medium">{event.venue}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm text-black whitespace-nowrap">
                {formatDate(event.date)}
              </TableCell>
              <TableCell>
                <EventStatusBadge status={event.status} />
              </TableCell>
              <TableCell className="text-sm text-black">
                {event._count.participants}
                {event.capacity && (
                  <span className="text-black"> / {event.capacity}</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-black whitespace-nowrap">
                {event.isFree ? (
                  <span className="text-[#014421] font-medium">Free</span>
                ) : (
                  formatCurrency(event.amount ?? 0)
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Actions for ${event.name}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/events/${event.id}/edit`}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/events/${event.id}/participants`}>
                        <Users className="h-4 w-4 mr-2" />
                        Participants ({event._count.participants})
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/events/${event.id}/scan`}>
                        <QrCode className="h-4 w-4 mr-2" />
                        QR Scanner
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleToggleStatus(event.id, event.status)}
                    >
                      {event.status === "PUBLISHED" ? (
                        <>
                          <EyeOff className="h-4 w-4 mr-2" />
                          Unpublish
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-2" />
                          Publish
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <ConfirmDialog
                      trigger={
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      }
                      title="Delete Event"
                      description={
                        event._count.participants > 0
                          ? `This event has ${event._count.participants} participant(s). It will be marked as Cancelled instead of deleted.`
                          : "Are you sure you want to delete this event? This action cannot be undone."
                      }
                      confirmLabel="Delete"
                      onConfirm={() => handleDelete(event.id)}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
