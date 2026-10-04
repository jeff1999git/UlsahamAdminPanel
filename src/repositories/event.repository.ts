import { cache } from "react"
import { prisma } from "@/lib/prisma"
import type { EventStatus, Prisma } from "@prisma/client"
import type { EventListParams } from "@/types/event.types"
import { DEFAULT_PAGE_SIZE, COMPETITION_NUMBER_BASE } from "@/constants"
import { hasEventEnded } from "@/lib/event-time"
import { entryStatusOf } from "@/lib/entry-type"

/** Statuses the public site may see for an event that has not happened yet. */
const PUBLIC_LIVE_STATUSES: EventStatus[] = ["PUBLISHED", "BOOKING_CLOSED"]

const OBJECT_ID = /^[a-f\d]{24}$/i

/**
 * One read per request: a page's generateMetadata and the page itself both
 * ask for the event, and cache() shares the result within that render.
 * Outside a render (server actions, route handlers) it calls straight through,
 * so writes always read fresh data. `_count` feeds the edit page's delete
 * warning and deleteEventWithCleanup.
 */
export const findEventById = cache(async (id: string) => {
  // A malformed id (a mistyped URL) is no event, not a Prisma error.
  if (!OBJECT_ID.test(id)) return null
  return prisma.event.findUnique({
    where: { id },
    include: { _count: { select: { participants: true } } },
  })
})

export async function findEventBySlug(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    include: { _count: { select: { participants: true } } },
  })
}

export async function findPublishedEventBySlug(slug: string) {
  return prisma.event.findFirst({
    where: { slug, status: { in: [...PUBLIC_LIVE_STATUSES, "COMPLETED"] } },
  })
}

/**
 * Everything the booking and payment routes read about an event, in one query
 * with no participant count: status and times, venue, capacity, every pricing
 * input, the competition rules and the coupon and complimentary codes.
 */
const BOOKABLE_EVENT_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  date: true,
  startTime: true,
  endTime: true,
  venue: true,
  capacity: true,
  isFree: true,
  amount: true,
  earlyBirdAmount: true,
  isEarlyBird: true,
  gstEnabled: true,
  platformFeeEnabled: true,
  isCompetition: true,
  participationType: true,
  groupExtraAmount: true,
  couponCodes: true,
  complimentaryCodes: true,
} satisfies Prisma.EventSelect

/**
 * The event a booking or payment route works on. Ended and cancelled events
 * are found too, so the routes can refuse them with their reason instead of
 * "not found"; drafts (ANNOUNCED) are not.
 */
export async function findBookableEventBySlug(slug: string) {
  return prisma.event.findFirst({
    where: { slug, status: { in: [...PUBLIC_LIVE_STATUSES, "COMPLETED", "CANCELLED"] } },
    select: BOOKABLE_EVENT_SELECT,
  })
}

/**
 * What a ticket shows about its event, for the payment status check. Drafts
 * and cancelled events are not found.
 */
export async function findTicketEventBySlug(slug: string) {
  return prisma.event.findFirst({
    where: { slug, status: { in: [...PUBLIC_LIVE_STATUSES, "COMPLETED"] } },
    select: { id: true, name: true, date: true, venue: true, isCompetition: true },
  })
}

/**
 * Fields the admin events list needs (see AdminEventListItem), plus
 * archivedParticipantCount for the registered count. Selecting them keeps the
 * coupon and complimentary codes, descriptions and gallery out of the page.
 */
const ADMIN_EVENT_LIST_SELECT = {
  id: true,
  name: true,
  date: true,
  startTime: true,
  endTime: true,
  venue: true,
  bannerImageUrl: true,
  status: true,
  isFree: true,
  amount: true,
  earlyBirdAmount: true,
  isEarlyBird: true,
  capacity: true,
  isCompetition: true,
  participationType: true,
  groupExtraAmount: true,
  gstEnabled: true,
  platformFeeEnabled: true,
  archivedParticipantCount: true,
} satisfies Prisma.EventSelect

export async function listEventsForAdmin(params: EventListParams) {
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
      select: ADMIN_EVENT_LIST_SELECT,
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

/**
 * Fields the public events list needs: what the site's cards read, plus
 * capacity and archivedParticipantCount, which only feed isFull and are
 * dropped before the response (see getPublishedEvents).
 */
const PUBLIC_EVENT_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  bannerImageUrl: true,
  venue: true,
  venueLink: true,
  date: true,
  startTime: true,
  endTime: true,
  isFree: true,
  amount: true,
  earlyBirdAmount: true,
  isEarlyBird: true,
  isCompetition: true,
  participationType: true,
  status: true,
  featured: true,
  capacity: true,
  archivedParticipantCount: true,
} satisfies Prisma.EventSelect

export async function listPublishedEvents(params: {
  page?: number
  limit?: number
  featured?: boolean
  upcoming?: boolean
  past?: boolean
}) {
  const { page = 1, limit = 10, featured, upcoming, past } = params

  // Events whose booking an admin closed stay listed on the site (they just
  // cannot be booked), so the live listing covers PUBLISHED + BOOKING_CLOSED.
  const where: Prisma.EventWhereInput = past
    ? { status: "COMPLETED" }
    : { status: { in: PUBLIC_LIVE_STATUSES } }

  if (!past) {
    if (featured === true) where.featured = true
    // NOT rather than `featured: false`, so events stored before the field
    // existed (no `featured` key in MongoDB) still count as not featured.
    if (featured === false) where.NOT = { featured: true }
    if (upcoming === true) {
      // Day-granularity boundary (matches autoCompleteExpiredEvents below): an
      // event stays "upcoming" for its whole calendar day, not just until the
      // exact instant stored in `date` (which is date-only, midnight UTC) —
      // otherwise today's events vanish from "upcoming" hours before they start.
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      where.date = { gte: startOfToday }
    }
  }

  const skip = (page - 1) * limit
  const events = await prisma.event.findMany({
    where,
    select: PUBLIC_EVENT_LIST_SELECT,
    orderBy: { date: past ? "desc" : "asc" },
    skip,
    take: limit,
  })

  // A page with fewer events than the limit is the last one, so its total is
  // known without counting. Only a full page (more may follow) or an empty
  // page past the first (the total is unknown) needs the count. Running it
  // after the list, not beside it, also avoids opening a second MongoDB
  // connection on a cold instance.
  const total =
    events.length === limit || (page > 1 && events.length === 0)
      ? await prisma.event.count({ where })
      : skip + events.length

  return { events, total, page, totalPages: Math.ceil(total / limit) }
}

/**
 * COMPLETED is set automatically, never by hand: an event completes once its
 * end time (date + endTime, IST) has passed. endTime is a display string, so
 * the comparison cannot run inside MongoDB — narrow to events whose day has
 * begun (plus a day of slack for timezone skew) and decide in JS.
 *
 * Only events the public could see are completed. A draft (ANNOUNCED) keeps
 * its status, because a COMPLETED event is listed on the site's past events.
 */
export async function autoCompleteExpiredEvents() {
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const candidates = await prisma.event.findMany({
    where: {
      date: { lte: cutoff },
      status: { in: PUBLIC_LIVE_STATUSES },
    },
    select: { id: true, date: true, startTime: true, endTime: true },
  })

  const endedIds = candidates.filter((event) => hasEventEnded(event)).map((event) => event.id)
  if (endedIds.length === 0) return

  return prisma.event.updateMany({
    where: { id: { in: endedIds } },
    data: { status: "COMPLETED" },
  })
}

export async function findEventCoupons(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { couponCodes: true },
  })
  return event?.couponCodes ?? []
}

export async function findEventComplimentaryCodes(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { complimentaryCodes: true },
  })
  return event?.complimentaryCodes ?? []
}

export async function incrementComplimentaryCodeUsage(eventId: string, code: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { complimentaryCodes: true },
  })
  if (!event) return
  const updated = event.complimentaryCodes.map((c) =>
    c.code.toUpperCase() === code.toUpperCase() ? { ...c, usedCount: c.usedCount + 1 } : c
  )
  return prisma.event.update({
    where: { id: eventId },
    data: { complimentaryCodes: { set: updated } },
  })
}

export async function allocateCompetitionNumber(eventId: string) {
  const updated = await prisma.event.update({
    where: { id: eventId },
    data: { lastCompetitionNumber: { increment: 1 } },
    select: { lastCompetitionNumber: true },
  })
  return COMPETITION_NUMBER_BASE + updated.lastCompetitionNumber
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
    prisma.event.count({ where: { status: { in: PUBLIC_LIVE_STATUSES } } }),
    prisma.event.count({ where: { status: { in: PUBLIC_LIVE_STATUSES }, date: { gt: now } } }),
    prisma.participant.count(),
    prisma.event.findMany({
      where: { isFree: false, amount: { not: null } },
      select: {
        amount: true,
        participants: {
          where: { amountPaid: true },
          select: { numberOfParticipants: true, amountPaid: true, entryType: true, paymentId: true, paymentOrderId: true },
        },
      },
    }),
  ])

  // Complimentary entries bring in no money, so only paid bookings count.
  const totalRevenue = revenueAgg.reduce((sum, event) => {
    const eventRevenue = event.participants
      .filter((p) => entryStatusOf(p, false) === "PAID")
      .reduce((s, p) => s + p.numberOfParticipants * (event.amount ?? 0), 0)
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
