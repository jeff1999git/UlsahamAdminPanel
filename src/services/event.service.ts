import {
  findEventById,
  findEventBySlug,
  findPublishedEventBySlug,
  listEvents,
  listPublishedEvents,
  autoCompleteExpiredEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getDashboardStats,
  findEventCoupons,
  findEventComplimentaryCodes,
  incrementComplimentaryCodeUsage,
} from "@/repositories/event.repository"
import { countParticipantsForEvent, sumParticipantsForEvents } from "@/repositories/participant.repository"
import { deleteImage } from "@/lib/cloudinary"
import { generateSlug } from "@/lib/slug"
import { sanitizeString } from "@/lib/utils"
import { hasEventEnded } from "@/lib/event-time"
import {
  getEffectiveStatus,
  getBookingClosedReason,
  getBookingClosedMessage,
  COMPLETED_IS_AUTOMATIC,
} from "@/lib/event-status"
import type { CreateEventInput, UpdateEventInput, EventListParams } from "@/types/event.types"
import type { EventStatus } from "@prisma/client"

export { COMPLETED_IS_AUTOMATIC }

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

function getEffectiveAmount(event: {
  isFree: boolean
  amount: number | null
  isEarlyBird?: boolean
  earlyBirdAmount?: number | null
}): number | null {
  if (event.isFree) return null
  if (event.isEarlyBird && event.earlyBirdAmount != null) return event.earlyBirdAmount
  return event.amount
}

export async function getEventById(id: string) {
  return findEventById(id)
}

export async function getEventBySlug(slug: string) {
  return findEventBySlug(slug)
}

export async function getPublishedEventBySlug(slug: string) {
  const event = await findPublishedEventBySlug(slug)
  if (!event) return null

  const registeredCount = await countParticipantsForEvent(event.id)
  const isFull = event.capacity !== null && registeredCount >= event.capacity
  const effectiveAmount = getEffectiveAmount(event)

  const { _count, bannerImageId, couponCodes, complimentaryCodes, lastCompetitionNumber, galleryImages, ...publicFields } = event
  return {
    ...publicFields,
    ...getPublicBookingState(event, isFull),
    registeredCount,
    isFull,
    effectiveAmount,
    galleryImageUrls: galleryImages.map((img) => img.url),
  }
}

export async function getEvents(params: EventListParams) {
  await autoCompleteExpiredEvents()
  const result = await listEvents(params)
  const sums = await sumParticipantsForEvents(result.events.map((event) => event.id))
  const events = result.events.map((event) => ({
    ...event,
    registeredCount: sums[event.id] ?? event.archivedParticipantCount ?? 0,
  }))
  return { ...result, events }
}

export async function getPublishedEvents(params: {
  page?: number
  limit?: number
  featured?: boolean
  upcoming?: boolean
  past?: boolean
}) {
  await autoCompleteExpiredEvents()
  const result = await listPublishedEvents(params)

  // Seats booked = sum of numberOfParticipants across bookings (a person may
  // hold several bookings), matching getPublishedEventBySlug — not row count.
  const sums = await sumParticipantsForEvents(result.events.map((event) => event.id))

  const eventsWithMeta = result.events.map((event) => {
    const registeredCount = sums[event.id] ?? event.archivedParticipantCount ?? 0
    const isFull = event.capacity !== null && registeredCount >= event.capacity
    const effectiveAmount = getEffectiveAmount(event)
    const { _count, couponCodes, complimentaryCodes, lastCompetitionNumber, galleryImages, ...rest } = event
    return {
      ...rest,
      ...getPublicBookingState(event, isFull),
      registeredCount,
      isFull,
      effectiveAmount,
    }
  })

  return { ...result, events: eventsWithMeta }
}

export async function createNewEvent(input: CreateEventInput) {
  assertStatusIsSelectable(input.status, input)

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createEvent({
    name: sanitizeString(input.name),
    slug: slug,
    description: sanitizeString(input.description),
    bannerImageUrl: input.bannerImageUrl,
    bannerImageId: input.bannerImageId,
    venue: sanitizeString(input.venue),
    venueLink: input.venueLink ?? null,
    date: input.date,
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
  } as Parameters<typeof createEvent>[0])
}

export async function updateExistingEvent(id: string, input: UpdateEventInput) {
  const existing = await findEventById(id)
  if (!existing) throw new Error("Event not found")

  assertStatusIsSelectable(input.status, {
    date: input.date ?? existing.date,
    startTime: input.startTime ?? existing.startTime,
    endTime: input.endTime ?? existing.endTime,
  })

  const updateData: Record<string, unknown> = {}

  if (input.name !== undefined) updateData.name = sanitizeString(input.name)
  if (input.slug !== undefined) updateData.slug = input.slug
  if (input.description !== undefined) updateData.description = sanitizeString(input.description)
  if (input.venue !== undefined) updateData.venue = sanitizeString(input.venue)
  if (input.venueLink !== undefined) updateData.venueLink = input.venueLink ?? null
  if (input.date !== undefined) updateData.date = input.date
  if (input.startTime !== undefined) updateData.startTime = input.startTime
  if (input.endTime !== undefined) updateData.endTime = input.endTime
  if (input.status !== undefined) updateData.status = input.status
  if (input.featured !== undefined) updateData.featured = input.featured
  if (input.capacity !== undefined) updateData.capacity = input.capacity ?? null
  if (input.couponCodes !== undefined) updateData.couponCodes = { set: input.couponCodes }
  if (input.complimentaryCodes !== undefined) updateData.complimentaryCodes = { set: input.complimentaryCodes }
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

  if (
    input.bannerImageUrl !== undefined &&
    input.bannerImageId !== undefined &&
    input.bannerImageId !== existing.bannerImageId
  ) {
    await deleteImage(existing.bannerImageId)
    updateData.bannerImageUrl = input.bannerImageUrl
    updateData.bannerImageId = input.bannerImageId
  }

  if (input.galleryImages !== undefined) {
    const keptIds = new Set(input.galleryImages.map((img) => img.id))
    const removed = existing.galleryImages.filter((img) => !keptIds.has(img.id))
    await Promise.all(removed.map((img) => deleteImage(img.id)))
    updateData.galleryImages = { set: input.galleryImages }
  }

  return updateEvent(id, updateData)
}

export async function deleteEventWithCleanup(id: string) {
  const event = await findEventById(id)
  if (!event) throw new Error("Event not found")

  const participantCount = event._count.participants

  if (participantCount > 0) {
    return updateEvent(id, { status: "CANCELLED" as EventStatus })
  }

  await deleteImage(event.bannerImageId)
  await Promise.all(event.galleryImages.map((img) => deleteImage(img.id)))
  return deleteEvent(id)
}

export async function toggleEventStatus(id: string, status: EventStatus) {
  const existing = await findEventById(id)
  if (!existing) throw new Error("Event not found")

  assertStatusIsSelectable(status, existing)

  return updateEvent(id, { status })
}

export { getDashboardStats, findEventCoupons, findEventComplimentaryCodes, incrementComplimentaryCodeUsage }
