"use server"

import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/activity-logger"
import {
  registerParticipant,
  updateExistingParticipant,
  deleteParticipantWithCleanup,
  toggleAttendance,
  getAllParticipants,
  getParticipants,
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

export async function scanAttendanceAction(
  ticketCode: string,
  eventId: string
): Promise<ActionResult<{ name: string; alreadyAttended: boolean }>> {
  const session = await getSession()

  try {
    const { found, alreadyAttended, participant } = await import(
      "@/services/participant.service"
    ).then((m) => m.scanAndMarkAttendance(ticketCode, eventId))

    if (!found || !participant) {
      return { success: false, error: "Invalid ticket code for this event" }
    }

    if (!alreadyAttended) {
      await logActivity({
        adminUsername: session.username,
        adminRole: session.role,
        action: "ATTENDANCE_MARKED",
        entity: "Participant",
        entityId: participant.id,
        description: `Scanned attendance for ${participant.name} (${ticketCode})`,
        metadata: { eventId, ticketCode },
      })
      revalidatePath(`/admin/events/${eventId}/participants`)
    }

    return {
      success: true,
      data: { name: participant.name, alreadyAttended },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to mark attendance"
    return { success: false, error: msg }
  }
}

export async function exportParticipantsAction(eventId: string) {
  await getSession()
  return getAllParticipants(eventId)
}

export async function getParticipantsAction(params: ParticipantListParams) {
  await getSession()
  return getParticipants(params)
}
