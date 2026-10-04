import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findParticipantById(id: string) {
  return prisma.participant.findUnique({
    where: { id },
    include: { event: true },
  })
}

export async function findParticipantByTicketCode(ticketCode: string) {
  return prisma.participant.findUnique({
    where: { ticketCode },
    include: {
      event: {
        select: { id: true, name: true, slug: true, date: true, venue: true },
      },
    },
  })
}

export async function findParticipantsByTicketCodes(ticketCodes: string[]) {
  return prisma.participant.findMany({
    where: { ticketCode: { in: ticketCodes } },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          slug: true,
          date: true,
          startTime: true,
          endTime: true,
          status: true,
          venue: true,
          bannerImageUrl: true,
          isFree: true,
          amount: true,
          earlyBirdAmount: true,
          isEarlyBird: true,
          groupExtraAmount: true,
          gstEnabled: true,
          platformFeeEnabled: true,
          isCompetition: true,
          participationType: true,
          competitionInstructions: true,
          competitionNotes: true,
        },
      },
    },
  })
}

/**
 * Most recent booking for a phone number on an event. A person may hold
 * several bookings for the same event, so this is a convenience lookup, not
 * a uniqueness check.
 */
export async function findParticipantByEventAndPhone(eventId: string, phone: string) {
  return prisma.participant.findFirst({
    where: { eventId, phone },
    orderBy: { registeredAt: "desc" },
  })
}

/** Booking created for a specific Razorpay order — the paid-booking idempotency key. */
export async function findParticipantByEventAndOrderId(eventId: string, paymentOrderId: string) {
  return prisma.participant.findFirst({
    where: { eventId, paymentOrderId },
  })
}

/** The booking recorded for a Razorpay order, on whichever event (paymentOrderId is indexed). */
export async function findParticipantByOrderId(paymentOrderId: string) {
  return prisma.participant.findFirst({
    where: { paymentOrderId },
  })
}

/**
 * The booking recorded for a Razorpay order, with what its ticket shows about
 * the event. payment/verify answers a retried confirmation from this alone,
 * before any Razorpay call.
 */
export async function findBookingByOrderId(paymentOrderId: string) {
  return prisma.participant.findFirst({
    where: { paymentOrderId },
    include: { event: { select: { slug: true, name: true, date: true, venue: true, isCompetition: true } } },
  })
}

/** Whether a Razorpay order has a booking yet, and whether it is paid: the webhook's first check. */
export async function findPaymentStateByOrderId(paymentOrderId: string) {
  return prisma.participant.findFirst({
    where: { paymentOrderId },
    select: { id: true, amountPaid: true },
  })
}

/**
 * The booking a registration submit (the site's requestId) already created on
 * this event for this phone. The (eventId, phone) index narrows the search.
 */
export async function findParticipantByEventAndRequestId(eventId: string, requestId: string, phone: string) {
  return prisma.participant.findFirst({
    where: { eventId, phone, requestId },
  })
}

/** Participant row only (no event relation) for a ticket code. */
export async function findParticipantByTicketCodeOnly(ticketCode: string) {
  return prisma.participant.findUnique({ where: { ticketCode } })
}

export async function findTicketCodesByEmail(email: string) {
  return prisma.participant.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { ticketCode: true },
    orderBy: { registeredAt: "desc" },
  })
}

export async function findTicketCodesByPhone(phone: string) {
  return prisma.participant.findMany({
    where: { phone },
    select: { ticketCode: true },
    orderBy: { registeredAt: "desc" },
  })
}

export async function getAllParticipantsForEvent(eventId: string) {
  return prisma.participant.findMany({
    where: { eventId },
    orderBy: { registeredAt: "asc" },
  })
}

/**
 * The participants page's rows: the columns its table shows, plus the three
 * fields entryStatusOf reads, which the page drops before the rows reach the
 * browser. The Excel export keeps getAllParticipantsForEvent.
 */
export async function getParticipantRowsForEvent(eventId: string) {
  return prisma.participant.findMany({
    where: { eventId },
    orderBy: { registeredAt: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      age: true,
      numberOfParticipants: true,
      ticketCode: true,
      competitionNumber: true,
      isGroupRegistration: true,
      amountPaid: true,
      attended: true,
      attendedAt: true,
      registeredAt: true,
      entryType: true,
      paymentId: true,
      paymentOrderId: true,
    },
  })
}

export async function createParticipant(data: Prisma.ParticipantCreateInput) {
  return prisma.participant.create({ data })
}

export async function updateParticipant(id: string, data: Prisma.ParticipantUpdateInput) {
  return prisma.participant.update({ where: { id }, data })
}

export async function deleteParticipant(id: string) {
  return prisma.participant.delete({ where: { id } })
}

export async function countParticipantsForEvent(eventId: string) {
  const result = await prisma.participant.aggregate({
    where: { eventId },
    _sum: { numberOfParticipants: true },
  })
  return result._sum.numberOfParticipants ?? 0
}

export async function sumParticipantsForEvents(eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {}
  const groups = await prisma.participant.groupBy({
    by: ["eventId"],
    where: { eventId: { in: eventIds } },
    _sum: { numberOfParticipants: true },
  })
  return Object.fromEntries(groups.map((g) => [g.eventId, g._sum.numberOfParticipants ?? 0]))
}

export async function pruneOldEventParticipants() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14) // 2 weeks after event date

  // Events more than 2 weeks past; the seat sums cover only those that still
  // hold participant records.
  const events = await prisma.event.findMany({
    where: { date: { lt: cutoff } },
    select: { id: true },
  })
  if (events.length === 0) return

  const sums = await sumParticipantsForEvents(events.map((e) => e.id))

  for (const [eventId, seats] of Object.entries(sums)) {
    // Snapshot the seat total onto the event before deleting. Only an event
    // not archived yet is written, so a repeated or overlapping run can never
    // replace the total with the count of whatever rows are left. NOT/gt also
    // matches events stored before the field existed.
    await prisma.event.updateMany({
      where: { id: eventId, NOT: { archivedParticipantCount: { gt: 0 } } },
      data: { archivedParticipantCount: seats },
    })
    await prisma.participant.deleteMany({ where: { eventId } })
  }
}

export async function scanParticipantByCode(ticketCode: string, eventId: string) {
  const participant = await prisma.participant.findUnique({ where: { ticketCode } })
  if (!participant || participant.eventId !== eventId) return { found: false, participant: null }
  return { found: true, participant }
}

export async function scanParticipantGlobal(ticketCode: string) {
  const participant = await prisma.participant.findUnique({
    where: { ticketCode },
    include: {
      event: { select: { id: true, name: true, slug: true, date: true, venue: true } },
    },
  })
  if (!participant) return { found: false, participant: null }
  return { found: true, participant }
}

export async function addEnteredCount(id: string, eventId: string, count: number) {
  const participant = await prisma.participant.findUnique({ where: { id } })
  if (!participant) throw new Error("Participant not found")
  if (participant.eventId !== eventId) throw new Error("Participant does not belong to this event")

  const remaining = participant.numberOfParticipants - participant.enteredCount
  if (count < 1 || count > remaining) {
    throw new Error(`Entry count must be between 1 and ${remaining}`)
  }

  // Compare-and-set: the write applies only while enteredCount still holds the
  // value checked above, so two gates scanning the same ticket at once cannot
  // admit more people than it covers. The entry that fills the ticket also
  // marks it attended, in the same write.
  const attendance = {
    attendedAt: participant.attendedAt ?? new Date(),
    ...(participant.enteredCount + count >= participant.numberOfParticipants ? { attended: true } : {}),
  }
  const { count: written } = await prisma.participant.updateMany({
    where: { id, eventId, enteredCount: participant.enteredCount },
    data: { enteredCount: { increment: count }, ...attendance },
  })

  const updated = await prisma.participant.findUnique({ where: { id } })
  if (!updated) throw new Error("Participant not found")
  if (written === 0) {
    // Bookings made before enteredCount existed have no such field: Prisma reads
    // it as its default 0, but the filter above cannot match a missing field. So
    // a miss with the count unchanged is that case, and the new count is written
    // unguarded, as every entry was before; a changed count means another gate
    // wrote first.
    if (updated.enteredCount !== participant.enteredCount) throw new Error("Just scanned at another gate — rescan")
    return prisma.participant.update({
      where: { id },
      data: { enteredCount: participant.enteredCount + count, ...attendance },
    })
  }
  return updated
}
