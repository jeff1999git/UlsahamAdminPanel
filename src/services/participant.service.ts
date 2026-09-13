import { Prisma } from "@prisma/client"
import {
  findParticipantById,
  findParticipantByTicketCode,
  findParticipantByEventAndOrderId,
  findParticipantByTicketCodeOnly,
  listParticipants,
  getAllParticipantsForEvent,
  createParticipant,
  updateParticipant,
  deleteParticipant,
  countParticipantsForEvent,
  markAttendance,
  markAttendanceByCode,
  scanParticipantByCode,
  scanParticipantGlobal,
  addEnteredCount,
} from "@/repositories/participant.repository"
import { findEventById, allocateCompetitionNumber } from "@/repositories/event.repository"
import { generateTicketCode } from "@/lib/ticket-code"
import { validateCompetitionQuantity } from "@/lib/competition"
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

export const PHONE_ALREADY_REGISTERED = "Phone number already registered for this event"
export const EVENT_FULL = "Event is full"

const TICKET_CODE_ATTEMPTS = 3

/** Returns the unique-index target when `err` is a Prisma unique violation, else null. */
function uniqueViolationTarget(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = (err.meta as { target?: unknown } | undefined)?.target
    return Array.isArray(target) ? target.join(",") : String(target ?? "")
  }
  return null
}

/**
 * Creates a booking (one ticket) for an event.
 *
 * A person may book the same event several times — each call creates its own
 * ticket. Paid bookings pass `paymentOrderId`; the call is then idempotent for
 * that order: the ticket code is derived from the order id, so a concurrent
 * replay (browser verify + Razorpay webhook, or a client retry) either finds
 * the existing booking or collides on the ticketCode unique index and returns
 * it, never creating a second ticket for one payment.
 */
export async function registerParticipant(
  input: CreateParticipantInput
): Promise<{
  participant: Awaited<ReturnType<typeof createParticipant>>
  isNew: boolean
}> {
  const event = await findEventById(input.eventId)
  if (!event) throw new Error("Event not found")
  if (event.status !== "PUBLISHED") throw new Error("Event is not accepting registrations")

  const orderId = input.paymentOrderId || null

  if (orderId) {
    const replay = await findParticipantByEventAndOrderId(input.eventId, orderId)
    if (replay) return { participant: replay, isNew: false }
  }

  const quantityError = validateCompetitionQuantity(event, input.numberOfParticipants)
  if (quantityError) throw new Error(quantityError)

  // Capacity is enforced when the booking is initiated. For a paid booking the
  // money has already been taken by the time we get here (capacity was checked
  // when the Razorpay order was created), so never reject it at this point.
  if (!orderId && event.capacity !== null) {
    const currentCount = await countParticipantsForEvent(input.eventId)
    if (currentCount + input.numberOfParticipants > event.capacity) {
      throw new Error(EVENT_FULL)
    }
  }

  const competitionNumber = event.isCompetition
    ? await allocateCompetitionNumber(event.id)
    : null

  for (let attempt = 0; attempt < TICKET_CODE_ATTEMPTS; attempt++) {
    // Deterministic per order (attempt 0), salted on a genuine code clash.
    const seed = orderId ? (attempt === 0 ? orderId : `${orderId}#${attempt}`) : undefined
    const ticketCode = generateTicketCode(event.slug, seed)

    try {
      const participant = await createParticipant({
        event: { connect: { id: input.eventId } },
        name: sanitizeString(input.name),
        phone: input.phone,
        email: input.email ? sanitizeString(input.email) : null,
        age: input.age,
        numberOfParticipants: input.numberOfParticipants,
        ticketCode,
        competitionNumber,
        isGroupRegistration: event.isCompetition && input.numberOfParticipants > 1,
        paymentOrderId: orderId,
        paymentId: input.paymentId || null,
        ...(input.amountPaid !== undefined && { amountPaid: input.amountPaid }),
      })
      return { participant, isNew: true }
    } catch (err) {
      const target = uniqueViolationTarget(err)
      if (target === null) throw err

      // Legacy per-event phone/email unique indexes still present in the DB
      // (schema no longer declares them; `prisma db push` removes them).
      if (/phone|email/i.test(target) && !/ticketCode/i.test(target)) {
        throw new Error(PHONE_ALREADY_REGISTERED)
      }

      // ticketCode clash. For a seeded code this almost always means the same
      // order was registered concurrently — hand back that booking.
      const clash = await findParticipantByTicketCodeOnly(ticketCode)
      if (clash && orderId && clash.eventId === input.eventId && clash.paymentOrderId === orderId) {
        return { participant: clash, isNew: false }
      }
      // Otherwise a different booking owns this code: try again with a new one.
    }
  }

  throw new Error("Could not allocate a unique ticket code. Please try again.")
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

  return deleteParticipant(id)
}

export async function toggleAttendance(id: string, attended: boolean) {
  if (attended) {
    const participant = await findParticipantById(id)
    if (!participant) throw new Error("Participant not found")
    return updateParticipant(id, {
      attended: true,
      attendedAt: new Date(),
      enteredCount: participant.numberOfParticipants,
    })
  }
  return updateParticipant(id, {
    attended: false,
    attendedAt: null,
    enteredCount: 0,
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

export async function scanForEntry(ticketCode: string, eventId: string) {
  const { found, participant } = await scanParticipantByCode(ticketCode, eventId)
  if (!found || !participant) return { found: false, participant: null }
  return { found: true, participant }
}

export async function scanForEntryGlobal(ticketCode: string) {
  const { found, participant } = await scanParticipantGlobal(ticketCode)
  if (!found || !participant) return { found: false, participant: null }
  return { found: true, participant }
}

export async function markEntry(participantId: string, eventId: string, count: number) {
  return addEnteredCount(participantId, eventId, count)
}
