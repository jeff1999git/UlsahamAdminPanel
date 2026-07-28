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
import { countParticipantsForEvent } from "@/repositories/participant.repository"
import { deleteImage } from "@/lib/cloudinary"
import { generateSlug } from "@/lib/slug"
import { sanitizeString } from "@/lib/utils"
import type { CreateEventInput, UpdateEventInput, EventListParams } from "@/types/event.types"
import type { EventStatus } from "@prisma/client"

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

  const { _count, bannerImageId, couponCodes, complimentaryCodes, ...publicFields } = event
  return { ...publicFields, registeredCount, isFull, effectiveAmount }
}

export async function getEvents(params: EventListParams) {
  await autoCompleteExpiredEvents()
  return listEvents(params)
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

  const eventsWithMeta = await Promise.all(
    result.events.map(async (event) => {
      const registeredCount = event._count.participants
      const isFull = event.capacity !== null && registeredCount >= event.capacity
      const effectiveAmount = getEffectiveAmount(event)
      const { _count, couponCodes, complimentaryCodes, ...rest } = event
      return { ...rest, registeredCount, isFull, effectiveAmount }
    })
  )

  return { ...result, events: eventsWithMeta }
}

export async function createNewEvent(input: CreateEventInput) {
  const baseSlug = input.slug || generateSlug(input.name)

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
    status: input.status,
    capacity: input.capacity ?? null,
    featured: input.featured,
    couponCodes: { set: input.couponCodes ?? [] },
    complimentaryCodes: { set: input.complimentaryCodes ?? [] },
  } as Parameters<typeof createEvent>[0])
}

export async function updateExistingEvent(id: string, input: UpdateEventInput) {
  const existing = await findEventById(id)
  if (!existing) throw new Error("Event not found")

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

  if (input.isFree !== undefined) {
    updateData.isFree = input.isFree
    updateData.amount = input.isFree ? null : (input.amount ?? null)
    if (input.isFree) {
      updateData.earlyBirdAmount = null
      updateData.isEarlyBird = false
      updateData.gstEnabled = false
      updateData.platformFeeEnabled = true
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
  return deleteEvent(id)
}

export async function toggleEventStatus(id: string, status: EventStatus) {
  return updateEvent(id, { status })
}

export { getDashboardStats, findEventCoupons, findEventComplimentaryCodes, incrementComplimentaryCodeUsage }
