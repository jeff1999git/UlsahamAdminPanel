"use client"

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react"
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
  Loader2,
  QrCode,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge, type BadgeProps } from "@/components/ui/badge"
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
import { LazyParticipantForm } from "@/components/participants/lazy-participant-form"
import {
  deleteParticipantAction,
  toggleAttendanceAction,
  exportParticipantsAction,
} from "@/actions/participant.actions"
import { formatDate, formatDateTime, isChunkLoadError } from "@/lib/utils"
import { entryStatusOf, ENTRY_STATUS_LABELS, type EntryStatus } from "@/lib/entry-type"
import type { TicketContacts } from "@/lib/ticket-contacts"
import { ACTION_FAILED_MESSAGE } from "@/constants"
import type { ParticipantRow } from "@/types/participant.types"

const ENTRY_BADGE_VARIANT: Record<EntryStatus, BadgeProps["variant"]> = {
  PAID: "success",
  COMPLIMENTARY: "secondary",
  FREE: "info",
  UNPAID: "muted",
}

/** How the booking was made on the site — read-only, never edited here. */
function EntryTypeBadge({ status, className }: { status: EntryStatus; className?: string }) {
  return (
    <Badge variant={ENTRY_BADGE_VARIANT[status]} className={className ?? "text-xs"}>
      {ENTRY_STATUS_LABELS[status]}
    </Badge>
  )
}

/** wa.me needs the country code; bookings store 10-digit Indian mobiles. */
function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "")
  return digits.length === 10 ? `91${digits}` : digits.replace(/^0/, "91")
}

/**
 * Every server refresh hands the table new row objects, so rows compare by
 * value (every ParticipantRow field is a plain value) and only a booking that
 * actually changed renders again.
 */
function sameRow(a: ParticipantRow, b: ParticipantRow) {
  if (a === b) return true
  return (Object.keys(a) as (keyof ParticipantRow)[]).every((key) => a[key] === b[key])
}

type RowAction = (p: ParticipantRow) => void
/** Opens a dialog for the booking; `trigger` is the button focus returns to. */
type RowDialogAction = (p: ParticipantRow, trigger: HTMLElement) => void

// ── Mobile list (< md) ──────────────────────────────────────────────────────

interface MobileRowProps {
  p: ParticipantRow
  index: number
  attendanceMode: boolean
  pending: boolean
  onOpen: RowDialogAction
  onPhone: RowDialogAction
  onToggle: RowAction
}

const MobileRow = memo(
  function MobileRow({ p, index, attendanceMode, pending, onOpen, onPhone, onToggle }: MobileRowProps) {
    // content-visibility: rows off screen skip layout, which every dialog's
    // scroll lock otherwise redoes for the whole list.
    return (
      <li className="relative flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-black/5 active:bg-black/5 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_62px]">
        {/* Opens the booking. It covers the whole row, and the phone number and
            the attendance control sit above it, so no button is nested in another. */}
        <button
          type="button"
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={(e) => onOpen(p, e.currentTarget)}
          aria-label={`Open booking: ${p.name}`}
        />

        {/* Serial number */}
        <span className="text-xs text-black/40 font-mono w-5 shrink-0 text-right">
          {index + 1}
        </span>

        {/* Name + phone + count */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-black truncate">
            {p.competitionNumber != null && (
              <span className="mr-1.5 inline-block rounded bg-[#014421]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#014421] align-middle">
                #{p.competitionNumber}
              </span>
            )}
            {p.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              type="button"
              className="relative text-xs text-[#014421] underline underline-offset-2 font-medium"
              onClick={(e) => onPhone(p, e.currentTarget)}
            >
              {p.phone}
            </button>
            <span className="text-xs text-black/40">·</span>
            <span className="text-xs text-black/60">
              {p.numberOfParticipants} person{p.numberOfParticipants !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Entry type, or the attendance checkbox in attendance mode */}
        <div className="relative">
          {attendanceMode ? (
            (p.amountPaid) ? (
              <label className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#014421] border border-[#014421] cursor-pointer">
                <Checkbox
                  checked={p.attended}
                  onCheckedChange={() => onToggle(p)}
                  disabled={pending}
                  aria-label={p.attended ? "Unmark attendance" : "Mark attendance"}
                  className="h-4 w-4 bg-white border-white data-[state=checked]:bg-white data-[state=checked]:border-white [&_svg]:text-[#014421]"
                />
                <span className="text-xs font-semibold text-white leading-none">Present</span>
              </label>
            ) : (
              <span className="text-[9px] text-black/40 font-medium px-2">Unpaid</span>
            )
          ) : (
            <EntryTypeBadge status={p.entryStatus} className="text-[10px] px-2" />
          )}
        </div>

        <ChevronRight className="h-4 w-4 text-black/30 shrink-0" />
      </li>
    )
  },
  (prev, next) =>
    sameRow(prev.p, next.p) &&
    prev.index === next.index &&
    prev.attendanceMode === next.attendanceMode &&
    prev.pending === next.pending &&
    prev.onOpen === next.onOpen &&
    prev.onPhone === next.onPhone &&
    prev.onToggle === next.onToggle
)

interface MobileListProps {
  rows: ParticipantRow[]
  attendanceMode: boolean
  pendingIds: ReadonlySet<string>
  onOpen: RowDialogAction
  onPhone: RowDialogAction
  onToggle: RowAction
}

const MobileList = memo(function MobileList({
  rows,
  attendanceMode,
  pendingIds,
  onOpen,
  onPhone,
  onToggle,
}: MobileListProps) {
  return (
    <div className="block md:hidden">
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border" aria-label="Participants list">
            {rows.map((p, idx) => (
              <MobileRow
                key={p.id}
                p={p}
                index={idx}
                attendanceMode={attendanceMode}
                pending={pendingIds.has(p.id)}
                onOpen={onOpen}
                onPhone={onPhone}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
})

// ── Desktop table (≥ md) ────────────────────────────────────────────────────

interface DesktopRowProps {
  p: ParticipantRow
  pending: boolean
  isSuperAdmin: boolean
  onQr: RowDialogAction
  onToggle: RowAction
  onEdit: RowDialogAction
  onDelete: RowDialogAction
}

const DesktopRow = memo(
  function DesktopRow({ p, pending, isSuperAdmin, onQr, onToggle, onEdit, onDelete }: DesktopRowProps) {
    const isEntryCard = p.competitionNumber != null

    return (
      <TableRow>
        <TableCell>
          <div>
            <p className="font-medium text-sm text-black">{p.name}</p>
            {p.email && (
              <p className="text-xs text-black">{p.email}</p>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            {p.competitionNumber != null && (
              <Badge variant="outline" className="text-xs font-bold text-[#014421] border-[#014421]/40 shrink-0">
                #{p.competitionNumber}
              </Badge>
            )}
            <code className="text-xs bg-black/10 border border-black px-1.5 py-0.5 rounded font-mono text-black">
              {p.ticketCode}
            </code>
          </div>
        </TableCell>
        <TableCell className="text-sm text-black">{p.phone}</TableCell>
        <TableCell className="text-sm text-center text-black">
          {p.numberOfParticipants}
        </TableCell>
        <TableCell>
          <EntryTypeBadge status={p.entryStatus} />
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => onQr(p, e.currentTarget)}
                aria-haspopup="dialog"
                aria-label={isEntryCard ? "View participation card" : "View QR code"}
              >
                {isEntryCard ? <Hash className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-black/30 cursor-not-allowed"
                disabled
                title={isEntryCard ? "Participation card locked — payment pending" : "Ticket locked — payment pending"}
              >
                <Lock className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onToggle(p)}
              disabled={pending}
              aria-label={p.attended ? "Unmark attendance" : "Mark attendance"}
              title={p.attended ? "Unmark attendance" : "Mark attendance"}
            >
              {p.attended ? (
                <UserX className="h-4 w-4 text-yellow-600" />
              ) : (
                <UserCheck className="h-4 w-4 text-green-600" />
              )}
            </Button>
            {isSuperAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => onEdit(p, e.currentTarget)}
                aria-label="Edit participant"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {isSuperAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-700"
                onClick={(e) => onDelete(p, e.currentTarget)}
                aria-haspopup="dialog"
                aria-label="Delete participant"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    )
  },
  (prev, next) =>
    sameRow(prev.p, next.p) &&
    prev.pending === next.pending &&
    prev.isSuperAdmin === next.isSuperAdmin &&
    prev.onQr === next.onQr &&
    prev.onToggle === next.onToggle &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete
)

interface DesktopTableProps {
  rows: ParticipantRow[]
  pendingIds: ReadonlySet<string>
  isSuperAdmin: boolean
  onQr: RowDialogAction
  onToggle: RowAction
  onEdit: RowDialogAction
  onDelete: RowDialogAction
}

const DesktopTable = memo(function DesktopTable({
  rows,
  pendingIds,
  isSuperAdmin,
  onQr,
  onToggle,
  onEdit,
  onDelete,
}: DesktopTableProps) {
  return (
    <div className="hidden md:block border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-card">
            <TableHead>Participant</TableHead>
            <TableHead>Ticket Code</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Participants</TableHead>
            <TableHead>Entry Type</TableHead>
            <TableHead>Attendance</TableHead>
            <TableHead>Registered</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <DesktopRow
              key={p.id}
              p={p}
              pending={pendingIds.has(p.id)}
              isSuperAdmin={isSuperAdmin}
              onQr={onQr}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
})

// ── Table ───────────────────────────────────────────────────────────────────

interface ParticipantTableProps {
  participants: ParticipantRow[]
  eventId: string
  /** Free events have no payments; older bookings on them show as Free. */
  eventIsFree: boolean
  totalCount: number
  eventName: string
  /** The event day in IST, as formatDate gives it. */
  eventDate: string
  eventVenue: string
  eventBannerUrl?: string | null
  competitionInstructions?: string | null
  competitionNotes?: string | null
  /** The contact lines tickets and participation cards print. */
  ticketContacts?: TicketContacts
  isSuperAdmin: boolean
}

export function ParticipantTable({
  participants,
  eventId,
  eventIsFree,
  totalCount,
  eventName,
  eventDate,
  eventVenue,
  eventBannerUrl,
  competitionInstructions,
  competitionNotes,
  ticketContacts,
  isSuperAdmin,
}: ParticipantTableProps) {
  const [isPending, startTransition] = useTransition()

  // Attendance ticks show at once. When the action and its page refresh
  // finish, the server's rows take over; a failed action reverts the tick.
  const [rows, setOptimisticAttended] = useOptimistic(
    participants,
    (current: ParticipantRow[], change: { id: string; attended: boolean }) =>
      current.map((p) => (p.id === change.id ? { ...p, attended: change.attended } : p))
  )

  // Bookings with an attendance request in flight. Their control is disabled,
  // so a double tap cannot send the same change twice; the ref answers at
  // once, before the disabled state has rendered.
  const pendingRef = useRef(new Set<string>())
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set())

  const [editParticipant, setEditParticipant] = useState<ParticipantRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Desktop row dialogs: one of each for the whole table, opened for a target
  const [qrTarget, setQrTarget] = useState<ParticipantRow | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ParticipantRow | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Mobile-only detail modal state (by id, so it shows the latest row)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [phoneContact, setPhoneContact] = useState<{ name: string; phone: string } | null>(null)

  // The dialogs above have no trigger of their own, so focus goes back by
  // hand to the button that opened them.
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // Mode toggle: false = payment mode, true = attendance mode (only shown on event day)
  const [attendanceMode, setAttendanceMode] = useState(false)
  // The switch flips at once; the list follows without holding it up.
  const listMode = useDeferredValue(attendanceMode)
  const [exporting, setExporting] = useState(false)

  // Decided after mount, in IST: the server renders in UTC, so deciding it
  // while rendering disagreed with the phone between 00:00 and 05:30 IST.
  const [isEventDay, setIsEventDay] = useState(false)
  useEffect(() => {
    setIsEventDay(formatDate(new Date()) === eventDate)
  }, [eventDate])

  const selectedMobile = selectedId === null ? null : rows.find((p) => p.id === selectedId) ?? null

  const restoreFocus = useCallback((event: Event) => {
    event.preventDefault()
    returnFocusRef.current?.focus()
  }, [])

  const setPending = useCallback((id: string, on: boolean) => {
    if (on) pendingRef.current.add(id)
    else pendingRef.current.delete(id)
    setPendingIds(new Set(pendingRef.current))
  }, [])

  const handleDelete = useCallback(
    (id: string) => {
      startTransition(async () => {
        try {
          const result = await deleteParticipantAction(id, eventId)
          if (result.success) {
            toast.success("Participant deleted")
          } else {
            toast.error(result.error)
          }
        } catch {
          toast.error(ACTION_FAILED_MESSAGE)
        }
      })
    },
    [eventId]
  )

  const handleToggleAttendance = useCallback(
    (p: ParticipantRow) => {
      if (pendingRef.current.has(p.id)) return
      // p is the row as shown, so a second tap sends the opposite of the first.
      const attended = !p.attended
      setPending(p.id, true)
      startTransition(async () => {
        setOptimisticAttended({ id: p.id, attended })
        try {
          const result = await toggleAttendanceAction(p.id, eventId, attended)
          if (result.success) {
            toast.success(result.data.attended ? "Attendance marked" : "Attendance unmarked")
          } else {
            toast.error(result.error)
          }
        } catch {
          toast.error(ACTION_FAILED_MESSAGE)
        } finally {
          // As a transition, so the control re-enables with the refreshed rows.
          startTransition(() => setPending(p.id, false))
        }
      })
    },
    [eventId, setOptimisticAttended, setPending]
  )

  const openDetail = useCallback((p: ParticipantRow, trigger: HTMLElement) => {
    returnFocusRef.current = trigger
    setSelectedId(p.id)
  }, [])

  const openPhone = useCallback((p: ParticipantRow, trigger: HTMLElement) => {
    returnFocusRef.current = trigger
    setPhoneContact({ name: p.name, phone: p.phone })
  }, [])

  const openQr = useCallback((p: ParticipantRow, trigger: HTMLElement) => {
    returnFocusRef.current = trigger
    setQrTarget(p)
    setQrOpen(true)
  }, [])

  // From the mobile detail dialog there is no trigger: focus goes back to the row.
  const openEdit = useCallback((p: ParticipantRow, trigger?: HTMLElement) => {
    if (trigger) returnFocusRef.current = trigger
    setEditParticipant(p)
    setEditOpen(true)
  }, [])

  const openDelete = useCallback((p: ParticipantRow, trigger: HTMLElement) => {
    returnFocusRef.current = trigger
    setDeleteTarget(p)
    setDeleteOpen(true)
  }, [])

  async function handleExportXLSX() {
    setExporting(true)
    try {
      // SheetJS is fetched on the first export, alongside the participant data.
      const [XLSX, all] = await Promise.all([import("xlsx"), exportParticipantsAction(eventId)])
      const sheetRows = all.map((p) => ({
        ...(p.competitionNumber != null ? { "Competition No.": p.competitionNumber } : {}),
        "Ticket Code": p.ticketCode,
        "Name": p.name,
        "Phone": p.phone,
        "Email": p.email ?? "",
        "Age": p.age,
        "No. of Participants": p.numberOfParticipants,
        "Entry Type": ENTRY_STATUS_LABELS[entryStatusOf(p, eventIsFree)],
        "Attended": p.attended ? "Yes" : "No",
        "Attended At": p.attendedAt ? formatDateTime(p.attendedAt) : "",
        "Registered At": formatDateTime(p.registeredAt),
      }))
      const ws = XLSX.utils.json_to_sheet(sheetRows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Participants")
      XLSX.writeFile(wb, `participants-${eventId}.xlsx`)
      toast.success("Excel file exported successfully")
    } catch (error) {
      toast.error(
        isChunkLoadError(error)
          ? "Could not load the Excel tool. Check your connection, refresh the page and try again."
          : "Failed to export Excel file"
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4" aria-busy={isPending || undefined}>
      {/* Count + Export */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-black font-medium">
          {totalCount} participant{totalCount !== 1 ? "s" : ""} registered
        </p>
        <Button variant="outline" size="sm" onClick={handleExportXLSX} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {exporting ? "Exporting..." : "Export Excel"}
        </Button>
      </div>

      {/* Mode toggle — only on event day */}
      {isEventDay && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-[#014421]/30 bg-[#014421]/5">
          <div>
            <p className="text-sm font-semibold text-black">
              {attendanceMode ? "Attendance Mode" : "Entry Type"}
            </p>
            <p className="text-xs text-black/50">
              {attendanceMode ? "Checkboxes mark attendance" : "How each booking was made"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-black/40" />
            <Switch
              checked={attendanceMode}
              onCheckedChange={setAttendanceMode}
              aria-label="Toggle between entry type and attendance mode"
            />
            <UserCheck className="h-4 w-4 text-[#014421]" />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <TableEmpty
          message="No participants yet"
          description="Add participants manually or share the event registration link."
        />
      ) : (
        <>
          <MobileList
            rows={rows}
            attendanceMode={listMode}
            pendingIds={pendingIds}
            onOpen={openDetail}
            onPhone={openPhone}
            onToggle={handleToggleAttendance}
          />
          <DesktopTable
            rows={rows}
            pendingIds={pendingIds}
            isSuperAdmin={isSuperAdmin}
            onQr={openQr}
            onToggle={handleToggleAttendance}
            onEdit={openEdit}
            onDelete={openDelete}
          />
        </>
      )}

      {/* ── Desktop row dialogs ─────────────────────────────────── */}
      {qrTarget && (
        <QRCodeModal
          key={qrTarget.ticketCode}
          open={qrOpen}
          onOpenChange={setQrOpen}
          onCloseAutoFocus={restoreFocus}
          ticketCode={qrTarget.ticketCode}
          participantName={qrTarget.name}
          eventName={eventName}
          eventDate={eventDate}
          eventVenue={eventVenue}
          numberOfParticipants={qrTarget.numberOfParticipants}
          competitionNumber={qrTarget.competitionNumber}
          competitionInstructions={competitionInstructions}
          competitionNotes={competitionNotes}
          bannerImageUrl={eventBannerUrl}
          contacts={ticketContacts}
        />
      )}

      {isSuperAdmin && deleteTarget && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onCloseAutoFocus={restoreFocus}
          title="Delete Participant"
          description={`Are you sure you want to delete ${deleteTarget.name}'s registration? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget.id)}
        />
      )}

      {/* ── Mobile detail modal ─────────────────────────────────── */}
      <Dialog
        open={!!selectedMobile}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        {selectedMobile && (
          <DialogContent className="max-w-sm mx-auto" onCloseAutoFocus={restoreFocus}>
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
              {selectedMobile.competitionNumber != null && (
                <div className="flex items-center gap-2.5">
                  <Hash className="h-4 w-4 text-[#014421] shrink-0" />
                  <span className="text-sm font-semibold text-[#014421]">
                    Competition No. {selectedMobile.competitionNumber}
                    {selectedMobile.isGroupRegistration ? " (Group)" : ""}
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

              {/* Entry type in detail */}
              <div className="flex items-center gap-2.5">
                <Banknote className="h-4 w-4 text-black/40 shrink-0" />
                <EntryTypeBadge status={selectedMobile.entryStatus} />
              </div>

              {/* Actions */}
              <div className="border-t pt-3 flex flex-col gap-2">
                {/* QR code — locked until payment */}
                {selectedMobile.amountPaid ? (
                  <QRCodeModal
                    ticketCode={selectedMobile.ticketCode}
                    participantName={selectedMobile.name}
                    eventName={eventName}
                    eventDate={eventDate}
                    eventVenue={eventVenue}
                    numberOfParticipants={selectedMobile.numberOfParticipants}
                    competitionNumber={selectedMobile.competitionNumber}
                    competitionInstructions={competitionInstructions}
                    competitionNotes={competitionNotes}
                    bannerImageUrl={eventBannerUrl}
                    contacts={ticketContacts}
                    fullWidth
                  />
                ) : (
                  <Button variant="outline" size="sm" className="w-full text-black/40" disabled>
                    <Lock className="h-3.5 w-3.5 mr-1.5" />
                    {selectedMobile.competitionNumber != null ? "Participation card locked until payment" : "Ticket locked until payment"}
                  </Button>
                )}

                {isSuperAdmin && (
                  <div className="grid grid-cols-2 gap-2">
                    {/* Edit */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const p = selectedMobile
                        setSelectedId(null)
                        openEdit(p)
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
                        setSelectedId(null)
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Phone contact modal */}
      <Dialog open={!!phoneContact} onOpenChange={(open) => !open && setPhoneContact(null)}>
        {phoneContact && (
          <DialogContent className="max-w-xs mx-auto" onCloseAutoFocus={restoreFocus}>
            <DialogHeader>
              <DialogTitle className="text-black text-base">{phoneContact.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-black/60 -mt-1">{phoneContact.phone}</p>
            <div className="flex flex-col gap-2 pt-1">
              <a
                href={`https://wa.me/${whatsappNumber(phoneContact.phone)}`}
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
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={restoreFocus}>
          <DialogHeader>
            <DialogTitle>Edit Participant</DialogTitle>
          </DialogHeader>
          {editParticipant && (
            <LazyParticipantForm
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
