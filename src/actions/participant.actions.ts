"use server"

import { z } from "zod"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/activity-logger"
import {
  registerParticipant,
  updateExistingParticipant,
  deleteParticipantWithCleanup,
  toggleAttendance,
  getAllParticipants,
  scanForEntry,
  scanForEntryGlobal,
  markEntry,
  importParticipants,
} from "@/services/participant.service"
import { participantSchema } from "@/validators/participant.validator"
import { findEventById } from "@/repositories/event.repository"
import type { ActionResult } from "@/types"
import type { Participant } from "@prisma/client"

async function getSession() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return {
    username: (session.user as { username?: string }).username ?? "unknown",
    role: (session.user as { role?: string }).role ?? "ADMIN",
  }
}

export async function addParticipantAction(
  eventId: string,
  formData: Record<string, unknown>
): Promise<ActionResult<Participant>> {
  const session = await getSession()

  // USER accounts enrol at the counter: a free event is added directly, a paid
  // one must go through Razorpay (createPaymentOrderAction), never through here.
  if (session.role === "USER") {
    const event = await findEventById(eventId)
    if (!event || !(event.isFree || !event.amount)) return { success: false, error: "Forbidden" }
  }

  const parsed = participantSchema.safeParse(formData)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    const first = Object.values(errors)[0]?.[0]
    return { success: false, error: first ?? "Validation failed" }
  }

  try {
    const { participant } = await registerParticipant({
      eventId,
      ...parsed.data,
      email: parsed.data.email || null,
      // Everyone added from the admin panel enters as complimentary.
      amountPaid: true,
      entryType: "COMPLIMENTARY",
    })

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "PARTICIPANT_ADDED",
      entity: "Participant",
      entityId: participant.id,
      description: `Added participant: ${participant.name} (${participant.ticketCode})`,
      metadata: { eventId, phone: participant.phone },
    })

    revalidatePath(`/admin/events/${eventId}/participants`)
    return { success: true, data: participant }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to add participant"
    return { success: false, error: msg }
  }
}

export async function updateParticipantAction(
  id: string,
  eventId: string,
  formData: Record<string, unknown>
): Promise<ActionResult<Participant>> {
  const session = await getSession()
  if (session.role !== "SUPER_ADMIN") return { success: false, error: "Forbidden" }

  const updateSchema = participantSchema.pick({
    name: true,
    email: true,
    age: true,
    numberOfParticipants: true,
  })

  const parsed = updateSchema.safeParse(formData)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    const first = Object.values(errors)[0]?.[0]
    return { success: false, error: first ?? "Validation failed" }
  }

  try {
    const participant = await updateExistingParticipant(id, {
      ...parsed.data,
      email: parsed.data.email || null,
    })

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "PARTICIPANT_UPDATED",
      entity: "Participant",
      entityId: id,
      description: `Updated participant: ${participant.name}`,
    })

    revalidatePath(`/admin/events/${eventId}/participants`)
    return { success: true, data: participant }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update participant"
    return { success: false, error: msg }
  }
}

export async function deleteParticipantAction(
  id: string,
  eventId: string
): Promise<ActionResult<void>> {
  const session = await getSession()
  if (session.role !== "SUPER_ADMIN") return { success: false, error: "Forbidden" }

  try {
    await deleteParticipantWithCleanup(id)

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "PARTICIPANT_DELETED",
      entity: "Participant",
      entityId: id,
      description: `Deleted participant ID: ${id}`,
      metadata: { eventId },
    })

    revalidatePath(`/admin/events/${eventId}/participants`)
    return { success: true, data: undefined }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete participant"
    return { success: false, error: msg }
  }
}

export async function toggleAttendanceAction(
  id: string,
  eventId: string,
  attended: boolean
): Promise<ActionResult<{ attended: boolean }>> {
  const session = await getSession()
  if (session.role === "USER") return { success: false, error: "Forbidden" }

  try {
    const participant = await toggleAttendance(id, attended)

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: attended ? "ATTENDANCE_MARKED" : "ATTENDANCE_UNMARKED",
      entity: "Participant",
      entityId: id,
      description: `${attended ? "Marked" : "Unmarked"} attendance for ${participant.name}`,
      metadata: { eventId, ticketCode: participant.ticketCode },
    })

    revalidatePath(`/admin/events/${eventId}/participants`)
    // Only what the table reads: the full row would carry the Razorpay
    // references the participants page keeps on the server.
    return { success: true, data: { attended: participant.attended } }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update attendance"
    return { success: false, error: msg }
  }
}

export type ScanEntryData = {
  participantId: string
  ticketCode: string
  name: string
  numberOfParticipants: number
  enteredCount: number
  fullyEntered: boolean
  remaining: number
  needsCountInput: boolean
}

export async function scanAttendanceAction(
  ticketCode: string,
  eventId: string
): Promise<ActionResult<ScanEntryData>> {
  const session = await getSession()
  if (session.role === "USER") return { success: false, error: "Forbidden" }

  try {
    const { found, participant } = await scanForEntry(ticketCode, eventId)
    if (!found || !participant) {
      return { success: false, error: "Invalid ticket code for this event" }
    }

    const isLegacyAttended = participant.attended && participant.enteredCount === 0
    const fullyEntered = isLegacyAttended || participant.enteredCount >= participant.numberOfParticipants
    const remaining = participant.numberOfParticipants - participant.enteredCount
    const needsCountInput = !fullyEntered && participant.numberOfParticipants > 1

    return {
      success: true,
      data: {
        participantId: participant.id,
        ticketCode: participant.ticketCode,
        name: participant.name,
        numberOfParticipants: participant.numberOfParticipants,
        enteredCount: participant.enteredCount,
        fullyEntered,
        remaining,
        needsCountInput,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to scan ticket"
    return { success: false, error: msg }
  }
}

export async function confirmEntryAction(
  participantId: string,
  eventId: string,
  count: number
): Promise<ActionResult<{ name: string; enteredCount: number; numberOfParticipants: number; fullyEntered: boolean }>> {
  const session = await getSession()
  if (session.role === "USER") return { success: false, error: "Forbidden" }

  try {
    const updated = await markEntry(participantId, eventId, count)
    const fullyEntered = updated.enteredCount >= updated.numberOfParticipants

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "ATTENDANCE_MARKED",
      entity: "Participant",
      entityId: updated.id,
      description: `${count} member(s) entered for ${updated.name} (${updated.ticketCode}) — ${updated.enteredCount}/${updated.numberOfParticipants} total`,
      metadata: { eventId, ticketCode: updated.ticketCode, count, enteredCount: updated.enteredCount },
    })

    // No revalidatePath: it would re-render the whole scan page inside every
    // scan's response, and the scanner uses only this result. The
    // participants page is dynamic, so it reads fresh data when opened.

    return {
      success: true,
      data: {
        name: updated.name,
        enteredCount: updated.enteredCount,
        numberOfParticipants: updated.numberOfParticipants,
        fullyEntered,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to confirm entry"
    return { success: false, error: msg }
  }
}

export type GlobalScanData = {
  participantId: string
  participantName: string
  phone: string
  email: string | null
  age: number | null
  numberOfParticipants: number
  enteredCount: number
  ticketCode: string
  fullyEntered: boolean
  remaining: number
  needsCountInput: boolean
  eventName: string
  eventDate: string
  eventVenue: string
  eventId: string
}

export async function scanGlobalAttendanceAction(
  ticketCode: string
): Promise<ActionResult<GlobalScanData>> {
  const session = await getSession()
  if (session.role === "USER") return { success: false, error: "Forbidden" }

  try {
    const { found, participant } = await scanForEntryGlobal(ticketCode)

    if (!found || !participant) {
      return { success: false, error: "Invalid ticket code" }
    }

    const isLegacyAttended = participant.attended && participant.enteredCount === 0
    const fullyEntered = isLegacyAttended || participant.enteredCount >= participant.numberOfParticipants
    const remaining = participant.numberOfParticipants - participant.enteredCount
    const needsCountInput = !fullyEntered && participant.numberOfParticipants > 1

    return {
      success: true,
      data: {
        participantId: participant.id,
        participantName: participant.name,
        phone: participant.phone,
        email: participant.email,
        age: participant.age,
        numberOfParticipants: participant.numberOfParticipants,
        enteredCount: participant.enteredCount,
        ticketCode: participant.ticketCode,
        fullyEntered,
        remaining,
        needsCountInput,
        eventName: participant.event.name,
        eventDate: new Date(participant.event.date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        eventVenue: participant.event.venue,
        eventId: participant.event.id,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to process scan"
    return { success: false, error: msg }
  }
}

export async function confirmGlobalEntryAction(
  participantId: string,
  eventId: string,
  count: number
): Promise<ActionResult<{ name: string; enteredCount: number; numberOfParticipants: number; fullyEntered: boolean }>> {
  const session = await getSession()
  if (session.role === "USER") return { success: false, error: "Forbidden" }

  try {
    const updated = await markEntry(participantId, eventId, count)
    const fullyEntered = updated.enteredCount >= updated.numberOfParticipants

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "ATTENDANCE_MARKED",
      entity: "Participant",
      entityId: updated.id,
      description: `${count} member(s) entered for ${updated.name} (${updated.ticketCode}) — ${updated.enteredCount}/${updated.numberOfParticipants} total`,
      metadata: { eventId, ticketCode: updated.ticketCode, count, enteredCount: updated.enteredCount },
    })

    // No revalidatePath, as in confirmEntryAction: the scanner uses only this result.

    return {
      success: true,
      data: {
        name: updated.name,
        enteredCount: updated.enteredCount,
        numberOfParticipants: updated.numberOfParticipants,
        fullyEntered,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to confirm entry"
    return { success: false, error: msg }
  }
}

export type BulkImportRow = {
  row: number
  name: string
  phone: string
  email: string
  age: number
  numberOfParticipants: number
}

export type BulkImportResult = {
  added: number
  skipped: number
  errors: Array<{ row: number; name: string; error: string }>
}

const MAX_IMPORT_ROWS = 1000

// The dialog checks every row before sending it; they are checked again here,
// where it counts. One import adds at most MAX_IMPORT_ROWS rows, so it stays
// well inside the function's time limit.
const importRowsSchema = z
  .array(participantSchema.extend({ row: z.number() }))
  .max(MAX_IMPORT_ROWS, `One import can add at most ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows. Split the file and import each part.`)

/** The first problem with the rows, naming the spreadsheet row it is on. */
function importRowsError(error: z.ZodError, rows: unknown): string {
  const tooMany = error.issues.find((issue) => issue.path.length === 0)
  if (tooMany) return Array.isArray(rows) ? tooMany.message : "Invalid import data"
  const issue = error.issues[0]
  const index = issue?.path[0]
  if (typeof index !== "number" || !Array.isArray(rows)) return "Invalid import data"
  const row = (rows[index] as { row?: unknown } | null)?.row
  return `Row ${typeof row === "number" ? row : index + 1}: ${issue.message}`
}

export async function bulkAddParticipantsAction(
  eventId: string,
  rows: BulkImportRow[]
): Promise<ActionResult<BulkImportResult>> {
  const session = await getSession()
  if (session.role !== "SUPER_ADMIN") return { success: false, error: "Forbidden" }

  const parsed = importRowsSchema.safeParse(rows)
  if (!parsed.success) return { success: false, error: importRowsError(parsed.error, rows) }

  let result: BulkImportResult
  try {
    result = await importParticipants(eventId, parsed.data)
  } catch (error) {
    // Bookings written before the failure stay, and a second run skips them.
    console.error("Participant import failed:", error)
    revalidatePath(`/admin/events/${eventId}/participants`)
    return {
      success: false,
      error: "The import stopped part-way. Refresh the page to see who was added; importing the same file again skips them.",
    }
  }

  if (result.added > 0) {
    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "PARTICIPANT_ADDED",
      entity: "Participant",
      entityId: eventId,
      description: `Bulk imported ${result.added} participants from Excel (${result.skipped} skipped, ${result.errors.length} failed)`,
      metadata: { eventId, added: result.added, skipped: result.skipped, failed: result.errors.length },
    })
  }

  revalidatePath(`/admin/events/${eventId}/participants`)
  return { success: true, data: result }
}

// Participant lists carry every attendee's phone and email. USER accounts are
// kept off the participants page, so they are kept off its data as well.
export async function exportParticipantsAction(eventId: string) {
  const session = await getSession()
  if (session.role === "USER") throw new Error("Forbidden")
  return getAllParticipants(eventId)
}
