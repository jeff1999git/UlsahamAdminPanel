import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { ParticipantListParams } from "@/types/participant.types"
import { DEFAULT_PAGE_SIZE } from "@/constants"

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
        select: { id: true, name: true, slug: true, date: true, venue: true, bannerImageUrl: true, isCompetition: true, competitionInstructions: true, competitionNotes: true },
      },
    },
  })
}

export async function findParticipantByEventAndPhone(eventId: string, phone: string) {
  return prisma.participant.findUnique({
    where: { eventId_phone: { eventId, phone } },
  })
}

export async function findTicketCodesByEmail(email: string) {
  return prisma.participant.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { ticketCode: true },
  })
}

export async function listParticipants(params: ParticipantListParams) {
  const {
    eventId,
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    search,
    attended,
    sortBy = "registeredAt",
    sortOrder = "desc",
  } = params

  const where: Prisma.ParticipantWhereInput = { eventId }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
      { ticketCode: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ]
  }

  if (attended !== undefined && attended !== "") {
    where.attended = attended as boolean
  }

  const [participants, total] = await Promise.all([
    prisma.participant.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.participant.count({ where }),
  ])

  return {
    participants,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

export async function getAllParticipantsForEvent(eventId: string) {
  return prisma.participant.findMany({
    where: { eventId },
    orderBy: { registeredAt: "asc" },
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

export async function markAttendance(ticketCode: string, eventId: string) {
  const participant = await prisma.participant.findUnique({
    where: { ticketCode },
  })

  if (!participant) return { found: false, alreadyAttended: false, participant: null }
  if (participant.eventId !== eventId) return { found: false, alreadyAttended: false, participant: null }
  if (participant.attended) return { found: true, alreadyAttended: true, participant }

  const updated = await prisma.participant.update({
    where: { id: participant.id },
    data: { attended: true, attendedAt: new Date() },
  })

  return { found: true, alreadyAttended: false, participant: updated }
}

export async function pruneOldEventParticipants() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14) // 2 weeks after event date

  // Find events that ended more than 2 weeks ago and still have participant records
  const events = await prisma.event.findMany({
    where: { date: { lt: cutoff } },
    select: { id: true, _count: { select: { participants: true } } },
  })

  const stale = events.filter((e) => e._count.participants > 0)
  if (stale.length === 0) return

  const sums = await sumParticipantsForEvents(stale.map((e) => e.id))

  for (const event of stale) {
    // Snapshot the total participant count onto the event before deleting
    await prisma.event.update({
      where: { id: event.id },
      data: { archivedParticipantCount: sums[event.id] ?? event._count.participants },
    })
    await prisma.participant.deleteMany({ where: { eventId: event.id } })
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

  // Atomic increment to avoid TOCTOU race under concurrent scans
  const updated = await prisma.participant.update({
    where: { id },
    data: {
      enteredCount: { increment: count },
      attendedAt: participant.attendedAt ?? new Date(),
    },
  })

  // Mark fully attended when all members have entered (idempotent second write)
  if (updated.enteredCount >= updated.numberOfParticipants && !updated.attended) {
    return prisma.participant.update({ where: { id }, data: { attended: true } })
  }
  return updated
}

export async function markAttendanceByCode(ticketCode: string) {
  const eventInclude = { select: { id: true, name: true, date: true, venue: true } } as const

  const participant = await prisma.participant.findUnique({
    where: { ticketCode },
    include: { event: eventInclude },
  })

  if (!participant) return { found: false, alreadyAttended: false, participant: null }
  if (participant.attended) return { found: true, alreadyAttended: true, participant }

  const updated = await prisma.participant.update({
    where: { id: participant.id },
    data: { attended: true, attendedAt: new Date() },
    include: { event: eventInclude },
  })

  return { found: true, alreadyAttended: false, participant: updated }
}
