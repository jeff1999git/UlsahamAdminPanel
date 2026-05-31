import {
  findParticipantById,
  findParticipantByTicketCode,
  findParticipantByEventAndPhone,
  listParticipants,
  getAllParticipantsForEvent,
  createParticipant,
  updateParticipant,
  deleteParticipant,
  countParticipantsForEvent,
  markAttendance,
  markAttendanceByCode,
} from "@/repositories/participant.repository"
import { findEventById } from "@/repositories/event.repository"
import { generateAndUploadQRCode } from "@/services/qr.service"
import { generateTicketCode } from "@/lib/ticket-code"
import { deleteImage } from "@/lib/cloudinary"
import { sanitizeString } from "@/lib/utils"
import type {
  CreateParticipantInput,
  UpdateParticipantInput,
  ParticipantListParams,
} from "@/types/participant.types"

export async function getParticipantById(id: string) {
  return findParticipantById(id)
}

export async function getParticipants(params: ParticipantListParams) {
  return listParticipants(params)
}

export async function getAllParticipants(eventId: string) {
  return getAllParticipantsForEvent(eventId)
}

export async function registerParticipant(
  input: CreateParticipantInput
): Promise<{
  participant: Awaited<ReturnType<typeof createParticipant>>
  isNew: boolean
}> {
  const event = await findEventById(input.eventId)
  if (!event) throw new Error("Event not found")
  if (event.status !== "PUBLISHED") throw new Error("Event is not accepting registrations")

  const existing = await findParticipantByEventAndPhone(input.eventId, input.phone)
  if (existing) throw new Error("Phone number already registered for this event")

  if (event.capacity !== null) {
    const currentCount = await countParticipantsForEvent(input.eventId)
    if (currentCount + input.numberOfParticipants > event.capacity) {
      throw new Error("Event is full")
    }
  }

  const ticketCode = generateTicketCode(event.slug)
  const { qrCodeUrl, qrCodeImageId } = await generateAndUploadQRCode(ticketCode)

  const participant = await createParticipant({
    event: { connect: { id: input.eventId } },
    name: sanitizeString(input.name),
    phone: input.phone,
    email: input.email ? sanitizeString(input.email) : null,
    age: input.age,
    numberOfParticipants: input.numberOfParticipants,
    ticketCode,
    qrCodeUrl,
    qrCodeImageId,
  })

  return { participant, isNew: true }
}

export async function updateExistingParticipant(
  id: string,
  input: UpdateParticipantInput
) {
  const existing = await findParticipantById(id)
  if (!existing) throw new Error("Participant not found")

  const updateData: Record<string, unknown> = {}

  if (input.name !== undefined) updateData.name = sanitizeString(input.name)
  if (input.email !== undefined) updateData.email = input.email ? sanitizeString(input.email) : null
  if (input.age !== undefined) updateData.age = input.age
  if (input.numberOfParticipants !== undefined)
    updateData.numberOfParticipants = input.numberOfParticipants

  return updateParticipant(id, updateData)
}

export async function deleteParticipantWithCleanup(id: string) {
  const participant = await findParticipantById(id)
  if (!participant) throw new Error("Participant not found")

  await deleteImage(participant.qrCodeImageId)
  return deleteParticipant(id)
}

export async function toggleAttendance(id: string, attended: boolean) {
  return updateParticipant(id, {
    attended,
    attendedAt: attended ? new Date() : null,
  })
}

export async function toggleAmountPaid(id: string, amountPaid: boolean) {
  return updateParticipant(id, { amountPaid })
}

export async function scanAndMarkAttendance(ticketCode: string, eventId: string) {
  return markAttendance(ticketCode, eventId)
}

export async function checkTicketCode(ticketCode: string) {
  return findParticipantByTicketCode(ticketCode)
}

export async function scanGlobal(ticketCode: string) {
  return markAttendanceByCode(ticketCode)
}
