import { Prisma } from "@prisma/client"
import type { Event, Participant } from "@prisma/client"
import {
  findParticipantById,
  findParticipantByTicketCode,
  findParticipantByEventAndOrderId,
  findParticipantByTicketCodeOnly,
  findBookedPhones,
  findTicketCodeHolders,
  getAllParticipantsForEvent,
  createParticipant,
  createParticipants,
  updateParticipant,
  deleteParticipant,
  countParticipantsForEvent,
  scanParticipantByCode,
  scanParticipantGlobal,
  addEnteredCount,
} from "@/repositories/participant.repository"
import { findEventById, allocateCompetitionNumber, allocateCompetitionNumbers } from "@/repositories/event.repository"
import { generateTicketCode } from "@/lib/ticket-code"
import { validateCompetitionQuantity } from "@/lib/competition"
import { sanitizeString } from "@/lib/sanitize"
import type {
  CreateParticipantInput,
  UpdateParticipantInput,
} from "@/types/participant.types"

export async function getAllParticipants(eventId: string) {
  return getAllParticipantsForEvent(eventId)
}

export const PHONE_ALREADY_REGISTERED = "Phone number already registered for this event"
export const EVENT_FULL = "Event is full"
export const EVENT_NOT_ACCEPTING = "Event is not accepting registrations"

const TICKET_CODE_ATTEMPTS = 3

/** Returns the unique-index target when `err` is a Prisma unique violation, else null. */
function uniqueViolationTarget(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = (err.meta as { target?: unknown } | undefined)?.target
    return Array.isArray(target) ? target.join(",") : String(target ?? "")
  }
  return null
}

/** The event fields registerParticipant reads. */
type RegistrationEvent = Pick<Event, "id" | "slug" | "status" | "capacity" | "isCompetition" | "participationType">

/**
 * Creates a booking (one ticket) for an event.
 *
 * A person may book the same event several times — each call creates its own
 * ticket. Two keys make a call idempotent. Each is the seed of the booking's
 * ticket code, so even a concurrent duplicate collides on the ticketCode
 * unique index and gets the first booking back instead of a second ticket:
 *  - `paymentOrderId` (paid bookings): a replay of the order (browser verify +
 *    Razorpay webhook, or a client retry) returns the booking it created. That
 *    lookup runs before the status check, so a retry after booking closed
 *    still finds the ticket the payment bought.
 *  - `requestId` (free and complimentary registrations): the site's id for one
 *    submit, stored with the booking. The register route looks it up before
 *    its own checks; here it seeds the code.
 *
 * Pass `event` when the caller has just read it and counted seats itself (the
 * public register route), to skip reading the event and counting again.
 */
export async function registerParticipant(
  input: CreateParticipantInput,
  options: { event?: RegistrationEvent } = {}
): Promise<{
  participant: Awaited<ReturnType<typeof createParticipant>>
  isNew: boolean
}> {
  const orderId = input.paymentOrderId || null
  const requestId = orderId ? null : input.requestId || null

  if (orderId) {
    const replay = await findParticipantByEventAndOrderId(input.eventId, orderId)
    if (replay) return { participant: replay, isNew: false }
  }

  const event = options.event ?? (await findEventById(input.eventId))
  if (!event) throw new Error("Event not found")
  if (event.status !== "PUBLISHED") throw new Error(EVENT_NOT_ACCEPTING)

  const quantityError = validateCompetitionQuantity(event, input.numberOfParticipants)
  if (quantityError) throw new Error(quantityError)

  // Capacity is enforced when the booking is initiated. For a paid booking the
  // money has already been taken by the time we get here (capacity was checked
  // when the Razorpay order was created), so never reject it at this point. A
  // caller that passes the event has counted seats itself.
  if (!orderId && !options.event && event.capacity !== null) {
    const currentCount = await countParticipantsForEvent(input.eventId)
    if (currentCount + input.numberOfParticipants > event.capacity) {
      throw new Error(EVENT_FULL)
    }
  }

  const competitionNumber = event.isCompetition
    ? await allocateCompetitionNumber(event.id)
    : null

  const seedKey = orderId ?? (requestId ? `request:${input.eventId}:${requestId}` : null)

  /** Whether the booking that holds our ticket code is this same order or submit. */
  function isSameBooking(clash: Participant): boolean {
    if (clash.eventId !== input.eventId) return false
    if (orderId) return clash.paymentOrderId === orderId
    return requestId !== null && clash.requestId === requestId && clash.phone === input.phone
  }

  for (let attempt = 0; attempt < TICKET_CODE_ATTEMPTS; attempt++) {
    // Deterministic per order or submit (attempt 0), salted on a genuine code clash.
    const seed = seedKey ? (attempt === 0 ? seedKey : `${seedKey}#${attempt}`) : undefined
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
        ...(input.amountPaidPaise != null && { amountPaidPaise: input.amountPaidPaise }),
        ...(requestId && { requestId }),
        ...(input.amountPaid !== undefined && { amountPaid: input.amountPaid }),
        ...(input.entryType && { entryType: input.entryType }),
      })
      return { participant, isNew: true }
    } catch (err) {
      const target = uniqueViolationTarget(err)
      if (target === null) throw err

      // A seeded code already taken almost always means the same order or
      // submit was registered concurrently (payment/verify racing the Razorpay
      // webhook, a double submit) — hand back that booking. Asked before the
      // index check below: the same duplicate also breaks a legacy per-phone
      // index, and MongoDB may name that one instead of ticketCode.
      const clash = seedKey ? await findParticipantByTicketCodeOnly(ticketCode) : null
      if (clash && isSameBooking(clash)) {
        return { participant: clash, isNew: false }
      }

      // Legacy per-event phone/email unique indexes still present in the DB
      // (schema no longer declares them; `prisma db push` removes them).
      if (/phone|email/i.test(target) && !/ticketCode/i.test(target)) {
        throw new Error(PHONE_ALREADY_REGISTERED)
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

  // A changed seat count follows the rules of a new booking, and can never
  // drop below the people the gate has already let in on this ticket.
  const seats = input.numberOfParticipants
  if (seats !== undefined && seats !== existing.numberOfParticipants) {
    const entered = existing.enteredCount
    if (seats < entered) {
      throw new Error(
        `${entered} ${entered === 1 ? "person has" : "people have"} already entered on this ticket, so it needs at least ${entered} seat${entered === 1 ? "" : "s"}`
      )
    }
    const quantityError = validateCompetitionQuantity(existing.event, seats)
    if (quantityError) throw new Error(quantityError)
    updateData.numberOfParticipants = seats
    updateData.isGroupRegistration = existing.event.isCompetition && seats > 1
  }

  return updateParticipant(id, updateData)
}

/** An Excel import's bookings are written this many at a time. */
const IMPORT_BATCH_SIZE = 200

/** One row of an Excel import, as the import dialog sends it and the action checks it. */
export type ImportRow = {
  row: number
  name: string
  phone: string
  email?: string | null
  age: number
  numberOfParticipants: number
}

export type ImportSummary = {
  added: number
  skipped: number
  errors: Array<{ row: number; name: string; error: string }>
}

/**
 * One import row written on its own, after its batch was refused. A ticket code
 * another booking holds gets a new code; a legacy per-phone unique index means
 * the phone is already booked, so the row is skipped, as it always was.
 */
async function importOne(
  data: Prisma.ParticipantCreateManyInput,
  newTicketCode: () => string
): Promise<"added" | "skipped" | { error: string }> {
  for (let attempt = 0; attempt < TICKET_CODE_ATTEMPTS; attempt++) {
    try {
      await createParticipants([attempt === 0 ? data : { ...data, ticketCode: newTicketCode() }])
      return "added"
    } catch (err) {
      const target = uniqueViolationTarget(err)
      if (target === null) return { error: err instanceof Error ? err.message : "Failed to add" }
      if (/phone|email/i.test(target) && !/ticketCode/i.test(target)) return "skipped"
    }
  }
  return { error: "Could not allocate a unique ticket code. Please try again." }
}

/**
 * Adds the rows of an Excel import as complimentary bookings (amountPaid, entry
 * type COMPLIMENTARY, as for everyone staff add). Each row ends as adding it on
 * its own through registerParticipant would: a phone already on the event, or
 * on an earlier row of the file, is skipped, and a row the event refuses (not
 * taking bookings, the competition's group rule, no seats left) is reported
 * with the reason. It takes a few round trips instead of several per row: the
 * event and its booked phones are read once, seats are counted once, chest
 * numbers are reserved in one step and bookings are written 200 at a time.
 */
export async function importParticipants(eventId: string, rows: ImportRow[]): Promise<ImportSummary> {
  const summary: ImportSummary = { added: 0, skipped: 0, errors: [] }
  const fail = (row: ImportRow, error: string) => summary.errors.push({ row: row.row, name: row.name, error })

  const event = await findEventById(eventId)
  if (!event) {
    for (const row of rows) fail(row, "Event not found")
    return summary
  }

  const taken = await findBookedPhones(eventId, [...new Set(rows.map((row) => row.phone))])
  let seats = event.capacity !== null ? await countParticipantsForEvent(eventId) : 0

  const accepted: ImportRow[] = []
  for (const row of rows) {
    // Re-running an import must not duplicate people.
    if (taken.has(row.phone)) {
      summary.skipped++
      continue
    }
    const refusal =
      event.status !== "PUBLISHED"
        ? EVENT_NOT_ACCEPTING
        : (validateCompetitionQuantity(event, row.numberOfParticipants) ??
          (event.capacity !== null && seats + row.numberOfParticipants > event.capacity ? EVENT_FULL : null))
    if (refusal) {
      fail(row, refusal)
      continue
    }
    seats += row.numberOfParticipants
    taken.add(row.phone)
    accepted.push(row)
  }
  if (accepted.length === 0) return summary

  const firstNumber = event.isCompetition ? await allocateCompetitionNumbers(event.id, accepted.length) : null

  // Random codes, as any booking without an order or request id gets, and
  // never the same one twice within the import.
  const usedCodes = new Set<string>()
  const newTicketCode = () => {
    let code = generateTicketCode(event.slug)
    while (usedCodes.has(code)) code = generateTicketCode(event.slug)
    usedCodes.add(code)
    return code
  }

  // The participants list is ordered by registeredAt. Adding rows one by one
  // gave each a later time; a batch would share one, so each row is stamped a
  // millisecond after the one before and the list keeps the file's order.
  const importedAt = Date.now()
  const bookings = accepted.map((row, i) => ({
    row,
    data: {
      eventId,
      registeredAt: new Date(importedAt + i),
      name: sanitizeString(row.name),
      phone: row.phone,
      email: row.email ? sanitizeString(row.email) : null,
      age: row.age,
      numberOfParticipants: row.numberOfParticipants,
      ticketCode: newTicketCode(),
      competitionNumber: firstNumber === null ? null : firstNumber + i,
      isGroupRegistration: event.isCompetition && row.numberOfParticipants > 1,
      paymentOrderId: null,
      paymentId: null,
      // Everyone added from the admin panel enters as complimentary.
      amountPaid: true,
      entryType: "COMPLIMENTARY" as const,
    } satisfies Prisma.ParticipantCreateManyInput,
  }))

  for (let start = 0; start < bookings.length; start += IMPORT_BATCH_SIZE) {
    const batch = bookings.slice(start, start + IMPORT_BATCH_SIZE)
    try {
      summary.added += await createParticipants(batch.map((booking) => booking.data))
      continue
    } catch (err) {
      if (uniqueViolationTarget(err) === null) throw err
    }

    // A unique index refused one row, almost always over a ticket code another
    // booking holds. Rows before it may have been written: count those by their
    // codes, then add the rest one at a time.
    const holders = new Map(
      (await findTicketCodeHolders(batch.map((booking) => booking.data.ticketCode))).map((h) => [h.ticketCode, h])
    )
    for (const booking of batch) {
      const holder = holders.get(booking.data.ticketCode)
      if (holder && holder.eventId === eventId && holder.phone === booking.data.phone) {
        summary.added++
        continue
      }
      // A code some other booking holds is swapped before the retry.
      const data = holder ? { ...booking.data, ticketCode: newTicketCode() } : booking.data
      const outcome = await importOne(data, newTicketCode)
      if (outcome === "added") summary.added++
      else if (outcome === "skipped") summary.skipped++
      else fail(booking.row, outcome.error)
    }
  }

  return summary
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

export async function checkTicketCode(ticketCode: string) {
  return findParticipantByTicketCode(ticketCode)
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
