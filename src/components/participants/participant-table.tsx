"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Download, Pencil, Trash2, UserCheck, UserX } from "lucide-react"
import Papa from "papaparse"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { TableEmpty } from "@/components/shared/data-table"
import { QRCodeModal } from "@/components/participants/qr-code-modal"
import { ParticipantForm } from "@/components/participants/participant-form"
import {
  deleteParticipantAction,
  toggleAttendanceAction,
  exportParticipantsAction,
} from "@/actions/participant.actions"
import { formatDate, formatDateTime } from "@/lib/utils"
import type { Participant } from "@prisma/client"

interface ParticipantTableProps {
  participants: Participant[]
  eventId: string
  totalCount: number
  eventName: string
  eventDate: string
  eventVenue: string
}

export function ParticipantTable({ participants, eventId, totalCount, eventName, eventDate, eventVenue }: ParticipantTableProps) {
  const [, startTransition] = useTransition()
  const [editParticipant, setEditParticipant] = useState<Participant | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteParticipantAction(id, eventId)
      if (result.success) {
        toast.success("Participant deleted")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleToggleAttendance(id: string, currentAttended: boolean) {
    startTransition(async () => {
      const result = await toggleAttendanceAction(id, eventId, !currentAttended)
      if (result.success) {
        toast.success(
          result.data.attended ? "Attendance marked" : "Attendance unmarked"
        )
      } else {
        toast.error(result.error)
      }
    })
  }

  async function handleExportCSV() {
    try {
      const all = await exportParticipantsAction(eventId)
      const csv = Papa.unparse(
        all.map((p) => ({
          "Ticket Code": p.ticketCode,
          "Name": p.name,
          "Phone": p.phone,
          "Email": p.email ?? "",
          "Age": p.age,
          "No. of Participants": p.numberOfParticipants,
          "Attended": p.attended ? "Yes" : "No",
          "Attended At": p.attendedAt ? formatDateTime(p.attendedAt) : "",
          "Registered At": formatDateTime(p.registeredAt),
        }))
      )
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `participants-${eventId}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("CSV exported successfully")
    } catch {
      toast.error("Failed to export CSV")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {totalCount} participant{totalCount !== 1 ? "s" : ""} registered
        </p>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {participants.length === 0 ? (
        <TableEmpty
          message="No participants yet"
          description="Add participants manually or share the event registration link."
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Participant</TableHead>
                <TableHead>Ticket Code</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Participants</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{p.name}</p>
                      {p.email && (
                        <p className="text-xs text-gray-400">{p.email}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                      {p.ticketCode}
                    </code>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{p.phone}</TableCell>
                  <TableCell className="text-sm text-center text-gray-600">
                    {p.numberOfParticipants}
                  </TableCell>
                  <TableCell>
                    {p.attended ? (
                      <Badge variant="success" className="text-xs">
                        Attended
                      </Badge>
                    ) : (
                      <Badge variant="muted" className="text-xs">
                        Not Attended
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-gray-400 whitespace-nowrap">
                    {formatDate(p.registeredAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <QRCodeModal
                        ticketCode={p.ticketCode}
                        participantName={p.name}
                        qrCodeUrl={p.qrCodeUrl}
                        eventName={eventName}
                        eventDate={eventDate}
                        eventVenue={eventVenue}
                      />

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleToggleAttendance(p.id, p.attended)}
                        aria-label={p.attended ? "Unmark attendance" : "Mark attendance"}
                        title={p.attended ? "Unmark attendance" : "Mark attendance"}
                      >
                        {p.attended ? (
                          <UserX className="h-4 w-4 text-yellow-600" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-green-600" />
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditParticipant(p)
                          setEditOpen(true)
                        }}
                        aria-label="Edit participant"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700"
                            aria-label="Delete participant"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete Participant"
                        description={`Are you sure you want to delete ${p.name}'s registration? This will also delete their QR code.`}
                        confirmLabel="Delete"
                        onConfirm={() => handleDelete(p.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Participant</DialogTitle>
          </DialogHeader>
          {editParticipant && (
            <ParticipantForm
              eventId={eventId}
              participant={editParticipant}
              onSuccess={() => {
                setEditOpen(false)
                setEditParticipant(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
