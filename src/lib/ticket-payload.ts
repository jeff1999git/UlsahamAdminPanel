/**
 * The confirmation the site shows once a payment is recorded. payment/verify
 * answers with it, and payment/status gives the same shape when the site
 * checks on a payment whose verify reply never arrived.
 */
export type TicketPayload = {
  ticketCode: string
  participantName: string
  eventName: string
  eventDate: Date
  eventVenue: string
  numberOfParticipants: number
  isCompetition: boolean
  competitionNumber: number | null
  isGroupRegistration: boolean
  paymentId: string | null
  orderId: string
}

export function ticketPayload(
  booking: {
    ticketCode: string
    name: string
    numberOfParticipants: number
    competitionNumber: number | null
    isGroupRegistration: boolean
  },
  event: { name: string; date: Date; venue: string; isCompetition: boolean },
  ids: { paymentId: string | null; orderId: string }
): TicketPayload {
  return {
    ticketCode: booking.ticketCode,
    participantName: booking.name,
    eventName: event.name,
    eventDate: event.date,
    eventVenue: event.venue,
    numberOfParticipants: booking.numberOfParticipants,
    isCompetition: event.isCompetition,
    competitionNumber: booking.competitionNumber,
    isGroupRegistration: booking.isGroupRegistration,
    paymentId: ids.paymentId,
    orderId: ids.orderId,
  }
}
