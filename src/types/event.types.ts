import type { Event, EventStatus, Participant, CouponCode, ComplimentaryCode, ParticipationType, EventImage } from "@prisma/client"
import type { BookingClosedReason } from "@/lib/event-status"

export type { CouponCode, ComplimentaryCode, ParticipationType, EventImage }

/**
 * One row of the admin events list: only the fields EventTable and
 * EnrollDialog read. The list is rendered by client components, so every
 * field here reaches the browser of every staff role; coupon and
 * complimentary codes must never be added. The edit page loads the full event.
 */
export type AdminEventListItem = Pick<
  Event,
  | "id"
  | "name"
  | "date"
  | "startTime"
  | "endTime"
  | "venue"
  | "bannerImageUrl"
  | "status"
  | "isFree"
  | "amount"
  | "earlyBirdAmount"
  | "isEarlyBird"
  | "isCompetition"
  | "participationType"
  | "groupExtraAmount"
  | "gstEnabled"
  | "platformFeeEnabled"
> & {
  /** Seat counts are left out for USER accounts. */
  capacity?: number | null
  registeredCount?: number
}

export type EventWithParticipants = Event & {
  participants: Participant[]
}

/**
 * One event in the public list (GET /api/public/events): exactly the fields the
 * site's cards, runner and coverflow read. Capacity and seat counts are used
 * server-side for isFull only; descriptions and pricing detail stay on the
 * detail endpoint.
 */
export type PublicEventListItem = Pick<
  Event,
  | "id"
  | "name"
  | "slug"
  | "bannerImageUrl"
  | "venue"
  | "venueLink"
  | "date"
  | "startTime"
  | "endTime"
  | "isFree"
  | "amount"
  | "earlyBirdAmount"
  | "isEarlyBird"
  | "isCompetition"
  | "participationType"
  | "featured"
> & {
  /** Auto-completed once the event's end time has passed. */
  status: EventStatus
  isFull: boolean
  bookingOpen: boolean
  bookingClosedReason: BookingClosedReason | null
}

/**
 * The event detail the public site reads (GET /api/public/events/[slug]),
 * built field by field by toPublicEvent so a new Event column stays private
 * until it is added here.
 */
export type PublicEvent = Pick<
  Event,
  | "id"
  | "name"
  | "slug"
  | "description"
  | "bannerImageUrl"
  | "venue"
  | "venueLink"
  | "date"
  | "startTime"
  | "endTime"
  | "isFree"
  | "amount"
  | "capacity"
  | "featured"
  | "gstEnabled"
  | "platformFeeEnabled"
  | "isCompetition"
  | "participationType"
  | "groupExtraAmount"
  | "competitionInstructions"
  | "competitionNotes"
> & {
  earlyBirdAmount: number | null
  isEarlyBird: boolean
  effectiveAmount: number | null
  registeredCount: number
  isFull: boolean
  /** Auto-completed once the event's end time has passed. */
  status: EventStatus
  bookingOpen: boolean
  bookingClosedReason: BookingClosedReason | null
  bookingClosedMessage: string | null
  galleryImageUrls: string[]
}

export type CreateEventInput = {
  name: string
  slug: string
  description: string
  bannerImageUrl: string
  bannerImageId: string
  venue: string
  venueLink?: string | null
  date: Date
  startTime: string
  endTime: string
  isFree: boolean
  amount?: number | null
  earlyBirdAmount?: number | null
  isEarlyBird?: boolean
  status: EventStatus
  capacity?: number | null
  featured: boolean
  gstEnabled?: boolean
  platformFeeEnabled?: boolean
  isCompetition?: boolean
  participationType?: ParticipationType
  groupExtraAmount?: number | null
  competitionInstructions?: string | null
  competitionNotes?: string | null
  couponCodes?: CouponCode[]
  complimentaryCodes?: ComplimentaryCode[]
  galleryImages?: EventImage[]
}

export type UpdateEventInput = Partial<CreateEventInput>

export type EventListParams = {
  page?: number
  limit?: number
  search?: string
  status?: EventStatus | ""
  sortBy?: "date" | "name" | "createdAt"
  sortOrder?: "asc" | "desc"
}

export type EventListResult = {
  events: AdminEventListItem[]
  total: number
  page: number
  totalPages: number
}
