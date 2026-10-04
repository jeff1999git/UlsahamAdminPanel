import { cache } from "react"
import { prisma } from "@/lib/prisma"
import type { EventStatus, Prisma } from "@prisma/client"
import type { EventListParams } from "@/types/event.types"
import { DEFAULT_PAGE_SIZE, COMPETITION_NUMBER_BASE } from "@/constants"
import { hasEventEnded, toEventDay } from "@/lib/event-time"
import { NO_RECORDED_CHARGE, estimatedRevenuePaise } from "@/lib/revenue"

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

/**
 * The public event detail. A cancelled event is found too, so the site can say
 * it was cancelled instead of "not found"; the public lists leave it out.
 */
export async function findPublishedEventBySlug(slug: string) {
  return prisma.event.findFirst({
    where: { slug, status: { in: [...PUBLIC_LIVE_STATUSES, "COMPLETED", "CANCELLED"] } },
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

/** An integer from a raw command reply: a plain number, or Extended JSON such as { $numberInt: "5" }. */
function rawInteger(value: unknown): number | null {
  if (value && typeof value === "object") {
    const wrapped = value as Record<string, unknown>
    value = wrapped.$numberInt ?? wrapped.$numberLong ?? wrapped.$numberDouble
  }
  const n = typeof value === "string" ? Number(value) : value
  return typeof n === "number" && Number.isSafeInteger(n) ? n : null
}

/**
 * Takes the next `count` chest numbers of a competition in one atomic step and
 * returns the first. findAndModify hands back the counter exactly as this $inc
 * left it, so two bookings at the same moment can never get the same number.
 * (Prisma's update re-reads the event after its $inc, and another booking's
 * $inc can land in between.)
 */
export async function allocateCompetitionNumbers(eventId: string, count: number): Promise<number> {
  const reply = (await prisma.$runCommandRaw({
    findAndModify: "Event",
    query: { _id: { $oid: eventId } },
    update: { $inc: { lastCompetitionNumber: count } },
    new: true,
    fields: { lastCompetitionNumber: 1 },
  })) as { value?: { lastCompetitionNumber?: unknown } | null }
  const last = rawInteger(reply.value?.lastCompetitionNumber)
  if (last === null) throw new Error("Event not found")
  return COMPETITION_NUMBER_BASE + last - count + 1
}

export async function allocateCompetitionNumber(eventId: string) {
  return allocateCompetitionNumbers(eventId, 1)
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

/** Which of these Cloudinary ids an event still uses, as its banner or in its gallery. */
export async function findEventImagesAmong(publicIds: string[]): Promise<string[]> {
  if (publicIds.length === 0) return []
  const events = await prisma.event.findMany({
    where: {
      OR: [{ bannerImageId: { in: publicIds } }, { galleryImages: { some: { id: { in: publicIds } } } }],
    },
    select: { bannerImageId: true, galleryImages: true },
  })
  const wanted = new Set(publicIds)
  return events
    .flatMap((event) => [event.bannerImageId, ...event.galleryImages.map((img) => img.id)])
    .filter((id) => wanted.has(id))
}

export async function getDashboardStats() {
  // Event dates are stored as UTC midnight of their day, so today's IST day in
  // that form is where Upcoming starts: an event stays upcoming all of its day,
  // not only until 05:30 IST.
  const startOfToday = toEventDay(new Date())

  const [
    totalEvents,
    publishedEvents,
    upcomingEvents,
    seatAgg,
    archivedAgg,
    chargedAgg,
    unrecordedPaid,
  ] = await Promise.all([
    prisma.event.count(),
    prisma.event.count({ where: { status: { in: PUBLIC_LIVE_STATUSES } } }),
    prisma.event.count({ where: { status: { in: PUBLIC_LIVE_STATUSES }, date: { gte: startOfToday } } }),
    // Seats, not bookings: one booking may cover up to ten people.
    prisma.participant.aggregate({ _sum: { numberOfParticipants: true } }),
    // Bookings are deleted two weeks after their event; their totals stay on it.
    prisma.event.aggregate({ _sum: { archivedParticipantCount: true, archivedRevenuePaise: true } }),
    // What Razorpay charged, recorded on each paid booking.
    prisma.participant.aggregate({ where: { amountPaid: true }, _sum: { amountPaidPaise: true } }),
    // Paid bookings recorded before that are estimated, as the dashboard always has.
    prisma.event.findMany({
      where: { isFree: false, amount: { not: null } },
      select: {
        amount: true,
        participants: {
          where: { amountPaid: true, ...NO_RECORDED_CHARGE },
          select: { numberOfParticipants: true, amountPaid: true, entryType: true, paymentId: true, paymentOrderId: true },
        },
      },
    }),
  ])

  // Complimentary entries bring in no money, so only paid bookings count.
  const estimatedPaise = unrecordedPaid.reduce(
    (sum, event) => sum + estimatedRevenuePaise(event.participants, event.amount),
    0
  )
  const revenuePaise =
    (chargedAgg._sum.amountPaidPaise ?? 0) + (archivedAgg._sum.archivedRevenuePaise ?? 0) + estimatedPaise

  return {
    totalEvents,
    publishedEvents,
    upcomingEvents,
    totalParticipants: (seatAgg._sum.numberOfParticipants ?? 0) + (archivedAgg._sum.archivedParticipantCount ?? 0),
    totalRevenue: revenuePaise / 100,
  }
}
