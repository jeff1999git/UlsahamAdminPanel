"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Download,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
  ChevronRight,
  Phone,
  Mail,
  User,
  Calendar,
  Hash,
  Users,
  MessageCircle,
  Banknote,
  Lock,
} from "lucide-react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
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
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { TableEmpty } from "@/components/shared/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { QRCodeModal } from "@/components/participants/qr-code-modal"
import { ParticipantForm } from "@/components/participants/participant-form"
import {
  deleteParticipantAction,
  toggleAttendanceAction,
  toggleAmountPaidAction,
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
  eventBannerUrl?: string | null
}

export function ParticipantTable({
  participants,
  eventId,
  totalCount,
  eventName,
  eventDate,
  eventVenue,
  eventBannerUrl,
}: ParticipantTableProps) {
  const [, startTransition] = useTransition()
  const [editParticipant, setEditParticipant] = useState<Participant | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Mobile-only detail modal state
  const [selectedMobile, setSelectedMobile] = useState<Participant | null>(null)
  const [phoneContact, setPhoneContact] = useState<{ name: string; phone: string } | null>(null)

  // Mode toggle: false = payment mode, true = attendance mode (only shown on event day)
  const [attendanceMode, setAttendanceMode] = useState(false)

  const isEventDay = (() => {
    const today = new Date()
    const evDate = new Date(eventDate)
    return (
      today.getFullYear() === evDate.getFullYear() &&
      today.getMonth() === evDate.getMonth() &&
      today.getDate() === evDate.getDate()
    )
  })()

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
        toast.success(result.data.attended ? "Attendance marked" : "Attendance unmarked")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleToggleAmountPaid(id: string, currentPaid: boolean) {
    startTransition(async () => {
      const result = await toggleAmountPaidAction(id, eventId, !currentPaid)
      if (result.success) {
        toast.success(result.data.amountPaid ? "Payment marked" : "Payment unmarked")
      } else {
        toast.error(result.error)
      }
    })
  }

  async function handleExportXLSX() {
    try {
      const all = await exportParticipantsAction(eventId)
      const rows = all.map((p) => ({
        "Ticket Code": p.ticketCode,
        "Name": p.name,
        "Phone": p.phone,
        "Email": p.email ?? "",
        "Age": p.age,
        "No. of Participants": p.numberOfParticipants,
        "Amount Paid": p.amountPaid ? "Yes" : "No",
        "Attended": p.attended ? "Yes" : "No",
        "Attended At": p.attendedAt ? formatDateTime(p.attendedAt) : "",
        "Registered At": formatDateTime(p.registeredAt),
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Participants")
      XLSX.writeFile(wb, `participants-${eventId}.xlsx`)
      toast.success("Excel file exported successfully")
    } catch {
      toast.error("Failed to export Excel file")
    }
  }

  return (
    <div className="space-y-4">
      {/* Count + Export */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-black font-medium">
          {totalCount} participant{totalCount !== 1 ? "s" : ""} registered
        </p>
        <Button variant="outline" size="sm" onClick={handleExportXLSX}>
          <Download className="h-4 w-4 mr-2" />
          Export Excel
        </Button>
      </div>

      {/* Mode toggle — only on event day */}
      {isEventDay && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-[#014421]/30 bg-[#014421]/5">
          <div>
            <p className="text-sm font-semibold text-black">
              {attendanceMode ? "Attendance Mode" : "Payment Mode"}
            </p>
            <p className="text-xs text-black/50">
              {attendanceMode ? "Checkboxes mark attendance" : "Checkboxes mark payment"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-black/40" />
            <Switch
              checked={attendanceMode}
              onCheckedChange={setAttendanceMode}
              aria-label="Toggle between payment and attendance mode"
            />
            <UserCheck className="h-4 w-4 text-[#014421]" />
          </div>
        </div>
      )}

      {participants.length === 0 ? (
        <TableEmpty
          message="No participants yet"
          description="Add participants manually or share the event registration link."
        />
      ) : (
        <>
          {/* ── Mobile list (< md) ──────────────────────────────── */}
          <div className="block md:hidden">
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border" aria-label="Participants list">
                  {participants.map((p, idx) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-black/5 active:bg-black/5 transition-colors"
                      onClick={() => setSelectedMobile(p)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setSelectedMobile(p)}
                    >
                      {/* Serial number */}
                      <span className="text-xs text-black/40 font-mono w-5 shrink-0 text-right">
                        {idx + 1}
                      </span>

                      {/* Name + phone + count */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-black truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <button
                            className="text-xs text-[#014421] underline underline-offset-2 font-medium"
                            onClick={(e) => { e.stopPropagation(); setPhoneContact({ name: p.name, phone: p.phone }) }}
                          >
                            {p.phone}
                          </button>
                          <span className="text-xs text-black/40">·</span>
                          <span className="text-xs text-black/60">
                            {p.numberOfParticipants} person{p.numberOfParticipants !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>

                      {/* Checkbox — payment mode or attendance mode */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                      >
                        {attendanceMode ? (
                          <label className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 cursor-pointer">
                            <Checkbox
                              checked={p.attended}
                              onCheckedChange={() => handleToggleAttendance(p.id, p.attended)}
                              aria-label={p.attended ? "Unmark attendance" : "Mark attendance"}
                              className="h-4 w-4"
                            />
                            <span className="text-xs font-semibold text-blue-700 leading-none">Present</span>
                          </label>
                        ) : (
                          <label className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-600 border border-emerald-600 cursor-pointer">
                            <Checkbox
                              checked={p.amountPaid ?? false}
                              onCheckedChange={() => handleToggleAmountPaid(p.id, p.amountPaid ?? false)}
                              aria-label={p.amountPaid ? "Unmark payment" : "Mark as paid"}
                              className="h-4 w-4 border-white data-[state=checked]:bg-white data-[state=checked]:border-white [&_svg]:text-emerald-600"
                            />
                            <span className="text-xs font-semibold text-white leading-none">Paid</span>
                          </label>
                        )}
                      </div>

                      <ChevronRight className="h-4 w-4 text-black/30 shrink-0" />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* ── Desktop table (≥ md) ────────────────────────────── */}
          <div className="hidden md:block border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-card">
                  <TableHead>Participant</TableHead>
                  <TableHead>Ticket Code</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Participants</TableHead>
                  <TableHead>Paid</TableHead>
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
                        <p className="font-medium text-sm text-black">{p.name}</p>
                        {p.email && (
                          <p className="text-xs text-black">{p.email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-black/10 border border-black px-1.5 py-0.5 rounded font-mono text-black">
                        {p.ticketCode}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-black">{p.phone}</TableCell>
                    <TableCell className="text-sm text-center text-black">
                      {p.numberOfParticipants}
                    </TableCell>
                    <TableCell>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={p.amountPaid ?? false}
                          onCheckedChange={() => handleToggleAmountPaid(p.id, p.amountPaid ?? false)}
                          aria-label={p.amountPaid ? "Unmark payment" : "Mark as paid"}
                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.attended ? (
                        <Badge variant="success" className="text-xs">Attended</Badge>
                      ) : (
                        <Badge variant="muted" className="text-xs">Not Attended</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-black whitespace-nowrap">
                      {formatDate(p.registeredAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {p.amountPaid ? (
                          <QRCodeModal
                            ticketCode={p.ticketCode}
                            participantName={p.name}
                            qrCodeUrl={p.qrCodeUrl}
                            eventName={eventName}
                            eventDate={eventDate}
                            eventVenue={eventVenue}
                            numberOfParticipants={p.numberOfParticipants}
                            bannerImageUrl={eventBannerUrl}
                          />
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-black/30 cursor-not-allowed"
                            disabled
                            title="Ticket locked — payment pending"
                          >
                            <Lock className="h-4 w-4" />
                          </Button>
                        )}
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
        </>
      )}

      {/* ── Mobile detail modal ─────────────────────────────────── */}
      <Dialog
        open={!!selectedMobile}
        onOpenChange={(open) => !open && setSelectedMobile(null)}
      >
        {selectedMobile && (
          <DialogContent className="max-w-sm mx-auto">
            <DialogHeader>
              <DialogTitle className="text-black">{selectedMobile.name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-1">
              {/* Contact */}
              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-black/40 shrink-0" />
                <span className="text-sm text-black">{selectedMobile.phone}</span>
              </div>
              {selectedMobile.email && (
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-black/40 shrink-0" />
                  <span className="text-sm text-black">{selectedMobile.email}</span>
                </div>
              )}
              {selectedMobile.age && (
                <div className="flex items-center gap-2.5">
                  <User className="h-4 w-4 text-black/40 shrink-0" />
                  <span className="text-sm text-black">Age {selectedMobile.age}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <Users className="h-4 w-4 text-black/40 shrink-0" />
                <span className="text-sm text-black">
                  {selectedMobile.numberOfParticipants} person{selectedMobile.numberOfParticipants !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-black/40 shrink-0" />
                <span className="text-sm text-black">
                  Registered {formatDate(selectedMobile.registeredAt)}
                </span>
              </div>
              {selectedMobile.attended && selectedMobile.attendedAt && (
                <div className="flex items-center gap-2.5">
                  <UserCheck className="h-4 w-4 text-[#014421] shrink-0" />
                  <span className="text-sm text-black">
                    Attended {formatDateTime(selectedMobile.attendedAt)}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2.5">
                <Hash className="h-4 w-4 text-black/40 mt-0.5 shrink-0" />
                <code className="text-xs bg-black/10 border border-black/20 px-1.5 py-0.5 rounded font-mono text-black break-all">
                  {selectedMobile.ticketCode}
                </code>
              </div>

              {/* Attendance status */}
              <div className="flex items-center justify-between pt-1">
                {selectedMobile.attended ? (
                  <Badge variant="success">Attended</Badge>
                ) : (
                  <Badge variant="muted">Not Attended</Badge>
                )}
              </div>

              {/* Payment status in detail */}
              <div className="flex items-center gap-2.5">
                <Banknote className="h-4 w-4 text-black/40 shrink-0" />
                {selectedMobile.amountPaid ? (
                  <Badge variant="success" className="text-xs">Amount Paid</Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">Payment Pending</Badge>
                )}
              </div>

              {/* Actions */}
              <div className="border-t pt-3 flex flex-col gap-2">
                {/* QR code — locked until payment */}
                {selectedMobile.amountPaid ? (
                  <QRCodeModal
                    ticketCode={selectedMobile.ticketCode}
                    participantName={selectedMobile.name}
                    qrCodeUrl={selectedMobile.qrCodeUrl}
                    eventName={eventName}
                    eventDate={eventDate}
                    eventVenue={eventVenue}
                    numberOfParticipants={selectedMobile.numberOfParticipants}
                    bannerImageUrl={eventBannerUrl}
                    fullWidth
                  />
                ) : (
                  <Button variant="outline" size="sm" className="w-full text-black/40" disabled>
                    <Lock className="h-3.5 w-3.5 mr-1.5" />
                    Ticket locked until payment
                  </Button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {/* Edit */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const p = selectedMobile
                      setSelectedMobile(null)
                      setEditParticipant(p)
                      setEditOpen(true)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>

                  {/* Delete */}
                  <ConfirmDialog
                    trigger={
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    }
                    title="Delete Participant"
                    description={`Are you sure you want to delete ${selectedMobile.name}'s registration? This will also delete their QR code.`}
                    confirmLabel="Delete"
                    onConfirm={() => {
                      handleDelete(selectedMobile.id)
                      setSelectedMobile(null)
                    }}
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Phone contact modal */}
      <Dialog open={!!phoneContact} onOpenChange={(open) => !open && setPhoneContact(null)}>
        {phoneContact && (
          <DialogContent className="max-w-xs mx-auto">
            <DialogHeader>
              <DialogTitle className="text-black text-base">{phoneContact.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-black/60 -mt-1">{phoneContact.phone}</p>
            <div className="flex flex-col gap-2 pt-1">
              <a
                href={`https://wa.me/${phoneContact.phone.replace(/\D/g, "").replace(/^0/, "91")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 w-full rounded-md border border-[#25D366] bg-[#25D366]/10 px-4 py-2.5 text-sm font-medium text-[#128C7E] hover:bg-[#25D366]/20 transition-colors"
                onClick={() => setPhoneContact(null)}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp Message
              </a>
              <a
                href={`tel:${phoneContact.phone}`}
                className="flex items-center justify-center gap-2.5 w-full rounded-md border border-black/20 px-4 py-2.5 text-sm font-medium text-black hover:bg-black/5 transition-colors"
                onClick={() => setPhoneContact(null)}
              >
                <Phone className="h-4 w-4" />
                Call
              </a>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Edit dialog (shared between desktop + mobile) */}
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
