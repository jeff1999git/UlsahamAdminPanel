import { prisma } from "@/lib/prisma"
import type { EventStatus, Prisma } from "@prisma/client"
import type { EventListParams } from "@/types/event.types"
import { DEFAULT_PAGE_SIZE } from "@/constants"

export async function findEventById(id: string) {
  return prisma.event.findUnique({
    where: { id },
    include: { _count: { select: { participants: true } } },
  })
}

export async function findEventBySlug(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    include: { _count: { select: { participants: true } } },
  })
}

export async function findPublishedEventBySlug(slug: string) {
  return prisma.event.findFirst({
    where: { slug, status: { in: ["PUBLISHED", "COMPLETED"] } },
    include: { _count: { select: { participants: true } } },
  })
}

export async function listEvents(params: EventListParams) {
  const {
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    search,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = params

  const where: Prisma.EventWhereInput = {}

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { venue: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ]
  }

  if (status) {
    where.status = status as EventStatus
  }

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: { _count: { select: { participants: true } } },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.event.count({ where }),
  ])

  return {
    events,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

export async function listPublishedEvents(params: {
  page?: number
  limit?: number
  featured?: boolean
  upcoming?: boolean
  past?: boolean
}) {
  const { page = 1, limit = 10, featured, upcoming, past } = params

  const where: Prisma.EventWhereInput = past
    ? { status: "COMPLETED" }
    : { status: "PUBLISHED" }

  if (!past) {
    if (featured === true) where.featured = true
    if (upcoming === true) where.date = { gt: new Date() }
  }

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: { _count: { select: { participants: true } } },
      orderBy: { date: past ? "desc" : "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.event.count({ where }),
  ])

  return { events, total, page, totalPages: Math.ceil(total / limit) }
}

export async function autoCompleteExpiredEvents() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return prisma.event.updateMany({
    where: {
      date: { lt: today },
      status: { in: ["ANNOUNCED", "PUBLISHED"] },
    },
    data: { status: "COMPLETED" },
  })
}

export async function createEvent(data: Prisma.EventCreateInput) {
  return prisma.event.create({ data })
}

export async function updateEvent(id: string, data: Prisma.EventUpdateInput) {
  return prisma.event.update({ where: { id }, data })
}

export async function deleteEvent(id: string) {
  return prisma.event.delete({ where: { id } })
}

export async function getDashboardStats() {
  const now = new Date()

  const [
    totalEvents,
    publishedEvents,
    upcomingEvents,
    participantAgg,
    revenueAgg,
  ] = await Promise.all([
    prisma.event.count(),
    prisma.event.count({ where: { status: "PUBLISHED" } }),
    prisma.event.count({ where: { status: "PUBLISHED", date: { gt: now } } }),
    prisma.participant.count(),
    prisma.event.findMany({
      where: { isFree: false, amount: { not: null } },
      select: {
        amount: true,
        participants: {
          where: { amountPaid: true },
          select: { numberOfParticipants: true },
        },
      },
    }),
  ])

  const totalRevenue = revenueAgg.reduce((sum, event) => {
    const eventRevenue = event.participants.reduce(
      (s, p) => s + p.numberOfParticipants * (event.amount ?? 0),
      0
    )
    return sum + eventRevenue
  }, 0)

  return {
    totalEvents,
    publishedEvents,
    upcomingEvents,
    totalParticipants: participantAgg,
    totalRevenue,
  }
}
