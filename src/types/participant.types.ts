import type { Participant, Event } from "@prisma/client"

export type ParticipantWithEvent = Participant & {
  event: Pick<Event, "id" | "name" | "slug" | "date" | "venue">
}

export type CreateParticipantInput = {
  eventId: string
  name: string
  phone: string
  email?: string | null
  age: number
  numberOfParticipants: number
  amountPaid?: boolean
}

export type UpdateParticipantInput = {
  name?: string
  email?: string | null
  age?: number
  numberOfParticipants?: number
}

export type ParticipantListParams = {
  eventId: string
  page?: number
  limit?: number
  search?: string
  attended?: boolean | ""
  sortBy?: "registeredAt" | "name" | "attended"
  sortOrder?: "asc" | "desc"
}

export type ParticipantListResult = {
  participants: Participant[]
  total: number
  page: number
  totalPages: number
}

export type PublicParticipantCheck = {
  ticketCode: string
  participantName: string
  eventName: string
  eventDate: Date
  eventVenue: string
  numberOfParticipants: number
  attended: boolean
  registeredAt: Date
}

export type RegistrationResult = {
  ticketCode: string
  qrCodeUrl: string
  participantName: string
  eventName: string
  eventDate: Date
  eventVenue: string
  numberOfParticipants: number
  isFree: boolean
}
