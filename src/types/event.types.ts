import type { Event, EventStatus, Participant, CouponCode, ComplimentaryCode, ParticipationType, EventImage } from "@prisma/client"

export type { CouponCode, ComplimentaryCode, ParticipationType, EventImage }

export type EventWithParticipantCount = Event & {
  _count: { participants: number }
  registeredCount: number
}

export type EventWithParticipants = Event & {
  participants: Participant[]
}

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
  events: EventWithParticipantCount[]
  total: number
  page: number
  totalPages: number
}
