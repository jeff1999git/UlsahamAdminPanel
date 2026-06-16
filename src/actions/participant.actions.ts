"use server"

import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/activity-logger"
import {
  registerParticipant,
  updateExistingParticipant,
  deleteParticipantWithCleanup,
  toggleAttendance,
  toggleAmountPaid,
  getAllParticipants,
  getParticipants,
  scanGlobal,
  scanForEntry,
  scanForEntryGlobal,
  markEntry,
} from "@/services/participant.service"
import { participantSchema } from "@/validators/participant.validator"
import type { ActionResult } from "@/types"
import type { Participant } from "@prisma/client"
import type { ParticipantListParams } from "@/types/participant.types"

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
): Promise<ActionResult<Participant>> {
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
    return { success: true, data: participant }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update attendance"
    return { success: false, error: msg }
  }
}

export async function toggleAmountPaidAction(
  id: string,
  eventId: string,
  amountPaid: boolean
): Promise<ActionResult<Participant>> {
  const session = await getSession()
  if (session.role !== "SUPER_ADMIN") return { success: false, error: "Forbidden" }

  try {
    const participant = await toggleAmountPaid(id, amountPaid)

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "PARTICIPANT_UPDATED",
      entity: "Participant",
      entityId: id,
      description: `${amountPaid ? "Marked" : "Unmarked"} payment for ${participant.name}`,
      metadata: { eventId },
    })

    revalidatePath(`/admin/events/${eventId}/participants`)
    return { success: true, data: participant }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update payment status"
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

    revalidatePath(`/admin/events/${eventId}/participants`)

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

    revalidatePath(`/admin/events/${eventId}/participants`)

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

export async function bulkAddParticipantsAction(
  eventId: string,
  rows: BulkImportRow[]
): Promise<ActionResult<BulkImportResult>> {
  const session = await getSession()
  if (session.role !== "SUPER_ADMIN") return { success: false, error: "Forbidden" }

  const result: BulkImportResult = { added: 0, skipped: 0, errors: [] }

  for (const row of rows) {
    try {
      await registerParticipant({
        eventId,
        name: row.name,
        phone: row.phone,
        email: row.email || null,
        age: row.age,
        numberOfParticipants: row.numberOfParticipants,
      })
      result.added++
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to add"
      if (msg === "Phone number already registered for this event") {
        result.skipped++
      } else {
        result.errors.push({ row: row.row, name: row.name, error: msg })
      }
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

export async function exportParticipantsAction(eventId: string) {
  await getSession()
  return getAllParticipants(eventId)
}

export async function getParticipantsAction(params: ParticipantListParams) {
  await getSession()
  return getParticipants(params)
}
