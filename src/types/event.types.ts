import type { Event, EventStatus, Participant } from "@prisma/client"

export type EventWithParticipantCount = Event & {
  _count: { participants: number }
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
> & {
  registeredCount: number
  isFull: boolean
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
  status: EventStatus
  capacity?: number | null
  featured: boolean
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
