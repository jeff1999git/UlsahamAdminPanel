import type { Participant, Event, EntryType } from "@prisma/client"
import type { EntryStatus } from "@/lib/entry-type"

export type ParticipantWithEvent = Participant & {
  event: Pick<Event, "id" | "name" | "slug" | "date" | "venue">
}

/**
 * A booking as the participants table receives it: the fields it shows, with
 * the entry type worked out on the server so Razorpay payment references stay
 * there. Every field is a plain value (dates as ISO strings), so rows can be
 * compared field by field.
 */
export type ParticipantRow = {
  id: string
  name: string
  phone: string
  email: string | null
  age: number
  numberOfParticipants: number
  ticketCode: string
  competitionNumber: number | null
  isGroupRegistration: boolean
  amountPaid: boolean
  attended: boolean
  attendedAt: string | null
  registeredAt: string
  entryStatus: EntryStatus
}

export type CreateParticipantInput = {
  eventId: string
  name: string
  phone: string
  email?: string | null
  age: number
  numberOfParticipants: number
  amountPaid?: boolean
  /** How the booking is settled; see the EntryType enum. */
  entryType?: EntryType
  /**
   * Razorpay order id for paid bookings. Makes registration idempotent: a
   * second call with the same order id returns the booking created by the
   * first instead of creating another ticket.
   */
  paymentOrderId?: string | null
  paymentId?: string | null
  /** What Razorpay charged for a paid booking, in paise (the order amount). */
  amountPaidPaise?: number | null
  /**
   * The site's id for one registration submit (free and complimentary
   * bookings, which have no order id). Stored with the booking and used to
   * derive its ticket code, so a duplicate of the same submit gets the first
   * booking back. Ignored when paymentOrderId is set.
   */
  requestId?: string | null
}

export type UpdateParticipantInput = {
  name?: string
  email?: string | null
  age?: number
  numberOfParticipants?: number
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
  participantName: string
  eventName: string
  eventDate: Date
  eventVenue: string
  numberOfParticipants: number
  isFree: boolean
}
