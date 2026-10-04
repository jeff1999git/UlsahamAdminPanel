import { after } from "next/server"
import {
  findEventById,
  findEventBySlug,
  findPublishedEventBySlug,
  findBookableEventBySlug,
  listEventsForAdmin,
  listPublishedEvents,
  autoCompleteExpiredEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getDashboardStats as readDashboardStats,
  findEventCoupons,
  findEventComplimentaryCodes,
  incrementComplimentaryCodeUsage,
} from "@/repositories/event.repository"
import { countParticipantsForEvent, sumParticipantsForEvents } from "@/repositories/participant.repository"
import { scheduleImageDeletes } from "@/services/housekeeping.service"
import { generateSlug } from "@/lib/slug"
import { sanitizeString } from "@/lib/sanitize"
import { getEffectiveAmount } from "@/lib/pricing"
import { hasEventEnded, toEventDay } from "@/lib/event-time"
import { noTiming, type ServerTiming } from "@/lib/server-timing"
import { SLUG_IN_USE_MESSAGE } from "@/constants"
import {
  getEffectiveStatus,
  getBookingClosedReason,
  getBookingClosedMessage,
  COMPLETED_IS_AUTOMATIC,
} from "@/lib/event-status"
import type {
  CreateEventInput,
  UpdateEventInput,
  EventListParams,
  EventListResult,
  PublicEvent,
  PublicEventListItem,
} from "@/types/event.types"
import { Prisma, type EventStatus } from "@prisma/client"

export { COMPLETED_IS_AUTOMATIC }

/** True when `error` is the unique slug index (Event_slug_key) refusing a write. */
function isSlugTaken(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false
  const target = (error.meta as { target?: unknown } | undefined)?.target
  return (Array.isArray(target) ? target.join(",") : String(target ?? "")).includes("slug")
}

// The COMPLETED sweep (autoCompleteExpiredEvents) runs at most once a minute
// per server instance. Reads that derive status from the clock
// (getEffectiveStatus) stay correct without it, so they only schedule it to run
// after the response. The past list filters on the stored COMPLETED, so it
// waits for a due or running sweep: an event that just ended joins it at most
// about a minute later.
const SWEEP_INTERVAL_MS = 60_000
let lastSweepAt = 0
// Claimed by a read that does not wait, and not started yet: it runs after that
// read's response, unless a past-list read (the home page asks for both lists
// at once) needs it first and runs it itself.
let sweepPending = false
let sweepInFlight: Promise<void> | null = null

function claimSweep(): boolean {
  const now = Date.now()
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return false
  lastSweepAt = now
  return true
}

function runSweep(): Promise<void> {
  sweepPending = false
  sweepInFlight ??= autoCompleteExpiredEvents()
    .then(
      () => undefined,
      (error) => console.error("COMPLETED sweep failed:", error)
    )
    .finally(() => {
      sweepInFlight = null
    })
  return sweepInFlight
}

function scheduleSweepIfDue() {
  if (!claimSweep()) return
  sweepPending = true
  after(() => (sweepPending ? runSweep() : undefined))
}

function awaitSweepIfDue(): Promise<void> {
  if (claimSweep() || sweepPending) return runSweep()
  return sweepInFlight ?? Promise.resolve()
}

/**
 * Everything the public site needs to decide whether the booking form opens:
 * the status as the visitor should see it (auto-completed when the event has
 * ended) plus why booking is shut, if it is.
 */
function getPublicBookingState(
  event: { status: EventStatus; date: Date | string; startTime: string; endTime: string },
  isFull: boolean
) {
  const reason = getBookingClosedReason({ ...event, isFull })
  return {
    status: getEffectiveStatus(event),
    bookingOpen: reason === null,
    bookingClosedReason: reason,
    bookingClosedMessage: getBookingClosedMessage(reason),
  }
}

/** COMPLETED is derived from the clock, so it can never be chosen by hand. */
function assertStatusIsSelectable(
  status: EventStatus | undefined,
  timing: { date: Date | string; startTime: string; endTime: string }
) {
  if (status === "COMPLETED" && !hasEventEnded(timing)) {
    throw new Error(COMPLETED_IS_AUTOMATIC)
  }
}

export async function getEventById(id: string) {
  return findEventById(id)
}

/**
 * The event detail (every column except the coupon and complimentary codes,
 * lastCompetitionNumber and the Cloudinary ids) plus booking state and the seat
 * count. The public detail route narrows it with toPublicEvent; the booking
 * and payment routes read getBookableEventBySlug instead.
 */
export async function getPublishedEventBySlug(slug: string, timing: ServerTiming = noTiming) {
  const event = await timing.time("event", () => findPublishedEventBySlug(slug))
  if (!event) return null

  // Bookings are deleted two weeks after the event; their seat total is kept
  // in archivedParticipantCount.
  const liveCount = await timing.time("sums", () => countParticipantsForEvent(event.id))
  const registeredCount = liveCount || event.archivedParticipantCount || 0
  const isFull = event.capacity !== null && registeredCount >= event.capacity
  const effectiveAmount = getEffectiveAmount(event)

  const { bannerImageId, couponCodes, complimentaryCodes, lastCompetitionNumber, galleryImages, ...publicFields } = event
  return {
    ...publicFields,
    ...getPublicBookingState(event, isFull),
    registeredCount,
    isFull,
    effectiveAmount,
    galleryImageUrls: galleryImages.map((img) => img.url),
  }
}

/**
 * The event a booking or payment route works on, in one read: pricing, codes,
 * capacity, competition rules and status. Ended and cancelled events come back
 * too, so the routes refuse them with their reason. The closed reason comes
 * from the status and the clock only; FULL needs a seat count, which a route
 * takes itself when it is about to add seats.
 */
export async function getBookableEventBySlug(slug: string) {
  const event = await findBookableEventBySlug(slug)
  if (!event) return null
  const bookingClosedReason = getBookingClosedReason(event)
  return {
    ...event,
    effectiveAmount: getEffectiveAmount(event),
    bookingClosedReason,
    bookingClosedMessage: getBookingClosedMessage(bookingClosedReason),
  }
}

export type BookableEvent = NonNullable<Awaited<ReturnType<typeof getBookableEventBySlug>>>

/** The public event detail, as an allow-list: only fields the site reads. */
export function toPublicEvent(event: PublicEvent): PublicEvent {
  return {
    id: event.id,
    name: event.name,
    slug: event.slug,
    description: event.description,
    bannerImageUrl: event.bannerImageUrl,
    galleryImageUrls: event.galleryImageUrls,
    venue: event.venue,
    venueLink: event.venueLink,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    status: event.status,
    featured: event.featured,
    isFree: event.isFree,
    amount: event.amount,
    earlyBirdAmount: event.earlyBirdAmount,
    isEarlyBird: event.isEarlyBird,
    effectiveAmount: event.effectiveAmount,
    gstEnabled: event.gstEnabled,
    platformFeeEnabled: event.platformFeeEnabled,
    isCompetition: event.isCompetition,
    participationType: event.participationType,
    groupExtraAmount: event.groupExtraAmount,
    competitionInstructions: event.competitionInstructions,
    competitionNotes: event.competitionNotes,
    capacity: event.capacity,
    registeredCount: event.registeredCount,
    isFull: event.isFull,
    bookingOpen: event.bookingOpen,
    bookingClosedReason: event.bookingClosedReason,
    bookingClosedMessage: event.bookingClosedMessage,
  }
}

export async function getEvents(params: EventListParams): Promise<EventListResult> {
  scheduleSweepIfDue()
  const result = await listEventsForAdmin(params)
  const sums = await sumParticipantsForEvents(result.events.map((event) => event.id))
  const events = result.events.map(({ archivedParticipantCount, ...event }) => ({
    ...event,
    // The sweep runs after this response, so show what it will store: a live
    // event past its end time reads Completed. Drafts are never swept.
    status: event.status === "ANNOUNCED" ? event.status : getEffectiveStatus(event),
    registeredCount: sums[event.id] ?? archivedParticipantCount ?? 0,
  }))
  return { ...result, events }
}

export async function getPublishedEvents(
  params: {
    page?: number
    limit?: number
    featured?: boolean
    upcoming?: boolean
    past?: boolean
  },
  timing: ServerTiming = noTiming
) {
  if (params.past) await timing.time("sweep", awaitSweepIfDue)
  else scheduleSweepIfDue()
  const result = await timing.time("list", () => listPublishedEvents(params))

  // Seats booked = sum of numberOfParticipants across bookings (a person may
  // hold several bookings), matching getPublishedEventBySlug — not row count.
  const sums = await timing.time("sums", () => sumParticipantsForEvents(result.events.map((event) => event.id)))

  const events: PublicEventListItem[] = result.events.map(({ capacity, archivedParticipantCount, ...event }) => {
    const registeredCount = sums[event.id] ?? archivedParticipantCount ?? 0
    const isFull = capacity !== null && registeredCount >= capacity
    const { status, bookingOpen, bookingClosedReason } = getPublicBookingState(event, isFull)
    return { ...event, status, isFull, bookingOpen, bookingClosedReason }
  })

  return { ...result, events }
}

export async function getDashboardStats() {
  scheduleSweepIfDue()
  return readDashboardStats()
}

export async function createNewEvent(input: CreateEventInput) {
  // Stored as the event's day in IST (see toEventDay).
  const date = toEventDay(input.date)
  assertStatusIsSelectable(input.status, { ...input, date })

  const baseSlug = input.slug || generateSlug(input.name)

  const isCompetition = input.isCompetition ?? false
  const participationType = isCompetition ? (input.participationType ?? "INDIVIDUAL") : "INDIVIDUAL"
  const groupExtraAmount =
    isCompetition && !input.isFree && participationType !== "INDIVIDUAL"
      ? (input.groupExtraAmount ?? null)
      : null
  const competitionInstructions =
    isCompetition && input.competitionInstructions ? sanitizeString(input.competitionInstructions) : null
  const competitionNotes =
    isCompetition && input.competitionNotes ? sanitizeString(input.competitionNotes) : null

  // Try base slug, then append a short timestamp suffix on collision
  let slug = baseSlug
  const existing = await findEventBySlug(slug)
  if (existing) {
    slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`
  }

  const data = {
    name: sanitizeString(input.name),
    slug: slug,
    description: sanitizeString(input.description),
    bannerImageUrl: input.bannerImageUrl,
    bannerImageId: input.bannerImageId,
    venue: sanitizeString(input.venue),
    venueLink: input.venueLink ?? null,
    date,
    startTime: input.startTime,
    endTime: input.endTime,
    isFree: input.isFree,
    amount: input.isFree ? null : (input.amount ?? null),
    earlyBirdAmount: input.isFree ? null : (input.earlyBirdAmount ?? null),
    isEarlyBird: input.isFree ? false : (input.isEarlyBird ?? false),
    gstEnabled: input.isFree ? false : (input.gstEnabled ?? false),
    platformFeeEnabled: input.isFree ? true : (input.platformFeeEnabled ?? true),
    isCompetition,
    participationType,
    groupExtraAmount,
    competitionInstructions,
    competitionNotes,
    status: input.status,
    capacity: input.capacity ?? null,
    featured: input.featured,
    couponCodes: { set: input.couponCodes ?? [] },
    complimentaryCodes: { set: input.complimentaryCodes ?? [] },
    galleryImages: { set: input.galleryImages ?? [] },
  } as Parameters<typeof createEvent>[0]

  // Two creates with the same slug at once: the unique index refuses the
  // second, which reads as a taken slug rather than Prisma's message.
  try {
    return await createEvent(data)
  } catch (error) {
    if (isSlugTaken(error)) throw new Error(SLUG_IN_USE_MESSAGE)
    throw error
  }
}

export async function updateExistingEvent(id: string, input: UpdateEventInput) {
  const existing = await findEventById(id)
  if (!existing) throw new Error("Event not found")

  // A changed date is stored as its day in IST (see toEventDay). One the form
  // sends back unchanged is left alone: an event saved before dates were
  // normalised may hold an instant, and its day is the UTC day the form shows.
  const dateChanged = input.date !== undefined && input.date.getTime() !== new Date(existing.date).getTime()
  const date = dateChanged ? toEventDay(input.date!) : existing.date

  assertStatusIsSelectable(input.status, {
    date,
    startTime: input.startTime ?? existing.startTime,
    endTime: input.endTime ?? existing.endTime,
  })

  // The unique index would refuse a taken slug too, but only with Prisma's
  // message; this says which field to change.
  if (input.slug !== undefined && input.slug !== existing.slug) {
    const holder = await findEventBySlug(input.slug)
    if (holder && holder.id !== id) throw new Error(SLUG_IN_USE_MESSAGE)
  }

  const updateData: Record<string, unknown> = {}

  if (input.name !== undefined) updateData.name = sanitizeString(input.name)
  if (input.slug !== undefined) updateData.slug = input.slug
  if (input.description !== undefined) updateData.description = sanitizeString(input.description)
  if (input.venue !== undefined) updateData.venue = sanitizeString(input.venue)
  if (input.venueLink !== undefined) updateData.venueLink = input.venueLink ?? null
  if (dateChanged) updateData.date = date
  if (input.startTime !== undefined) updateData.startTime = input.startTime
  if (input.endTime !== undefined) updateData.endTime = input.endTime
  if (input.status !== undefined) updateData.status = input.status
  if (input.featured !== undefined) updateData.featured = input.featured
  if (input.capacity !== undefined) updateData.capacity = input.capacity ?? null
  if (input.couponCodes !== undefined) updateData.couponCodes = { set: input.couponCodes }
  if (input.complimentaryCodes !== undefined) {
    // usedCount is counted by bookings, never taken from the form: the edit
    // page loads it once, so saving would otherwise put back the count from
    // when the page opened. Each code keeps the database's count; a new code
    // starts at 0. Codes match case-insensitively, as at redemption.
    const used = new Map(existing.complimentaryCodes.map((c) => [c.code.toUpperCase(), c.usedCount]))
    updateData.complimentaryCodes = {
      set: input.complimentaryCodes.map((c) => ({
        code: c.code,
        maxUses: c.maxUses,
        usedCount: used.get(c.code.toUpperCase()) ?? 0,
      })),
    }
  }
  if (input.gstEnabled !== undefined) updateData.gstEnabled = input.gstEnabled
  if (input.platformFeeEnabled !== undefined) updateData.platformFeeEnabled = input.platformFeeEnabled
  if (input.earlyBirdAmount !== undefined) updateData.earlyBirdAmount = input.earlyBirdAmount ?? null
  if (input.isEarlyBird !== undefined) updateData.isEarlyBird = input.isEarlyBird
  if (input.participationType !== undefined) {
    updateData.participationType = input.participationType
    if (input.participationType === "INDIVIDUAL") updateData.groupExtraAmount = null
  }
  if (input.groupExtraAmount !== undefined && updateData.groupExtraAmount === undefined) {
    updateData.groupExtraAmount = input.groupExtraAmount ?? null
  }

  if (input.competitionInstructions !== undefined) {
    updateData.competitionInstructions = input.competitionInstructions
      ? sanitizeString(input.competitionInstructions)
      : null
  }
  if (input.competitionNotes !== undefined) {
    updateData.competitionNotes = input.competitionNotes ? sanitizeString(input.competitionNotes) : null
  }

  if (input.isCompetition !== undefined) {
    updateData.isCompetition = input.isCompetition
    if (!input.isCompetition) {
      updateData.participationType = "INDIVIDUAL"
      updateData.groupExtraAmount = null
      updateData.competitionInstructions = null
      updateData.competitionNotes = null
    }
  }

  if (input.isFree !== undefined) {
    updateData.isFree = input.isFree
    updateData.amount = input.isFree ? null : (input.amount ?? null)
    if (input.isFree) {
      updateData.earlyBirdAmount = null
      updateData.isEarlyBird = false
      updateData.gstEnabled = false
      updateData.platformFeeEnabled = true
      updateData.groupExtraAmount = null
      updateData.couponCodes = { set: [] }
      updateData.complimentaryCodes = { set: [] }
    }
  }

  // Images this save lets go of. They are queued for deletion only after the
  // update succeeds, so a failed save (a taken slug, a database error) never
  // leaves the event pointing at deleted images.
  const releasedImageIds: string[] = []

  if (
    input.bannerImageUrl !== undefined &&
    input.bannerImageId !== undefined &&
    input.bannerImageId !== existing.bannerImageId
  ) {
    releasedImageIds.push(existing.bannerImageId)
    updateData.bannerImageUrl = input.bannerImageUrl
    updateData.bannerImageId = input.bannerImageId
  }

  if (input.galleryImages !== undefined) {
    const keptIds = new Set(input.galleryImages.map((img) => img.id))
    const removed = existing.galleryImages.filter((img) => !keptIds.has(img.id))
    releasedImageIds.push(...removed.map((img) => img.id))
    updateData.galleryImages = { set: input.galleryImages }
  }

  let event: Awaited<ReturnType<typeof updateEvent>>
  try {
    event = await updateEvent(id, updateData)
  } catch (error) {
    if (isSlugTaken(error)) throw new Error(SLUG_IN_USE_MESSAGE)
    throw error
  }

  await scheduleImageDeletes(releasedImageIds)
  return event
}

/** What deleteEventWithCleanup did: an event with bookings is cancelled, not deleted. */
export type DeleteEventOutcome = { outcome: "deleted" } | { outcome: "cancelled"; bookings: number }

export async function deleteEventWithCleanup(id: string): Promise<DeleteEventOutcome> {
  const event = await findEventById(id)
  if (!event) throw new Error("Event not found")

  const bookings = event._count.participants

  if (bookings > 0) {
    await updateEvent(id, { status: "CANCELLED" as EventStatus })
    return { outcome: "cancelled", bookings }
  }

  await deleteEvent(id)
  // Its images go once the website's cached pages no longer show them.
  await scheduleImageDeletes([event.bannerImageId, ...event.galleryImages.map((img) => img.id)])
  return { outcome: "deleted" }
}

export async function toggleEventStatus(id: string, status: EventStatus) {
  const existing = await findEventById(id)
  if (!existing) throw new Error("Event not found")

  assertStatusIsSelectable(status, existing)

  return updateEvent(id, { status })
}

export { findEventCoupons, findEventComplimentaryCodes, incrementComplimentaryCodeUsage }
