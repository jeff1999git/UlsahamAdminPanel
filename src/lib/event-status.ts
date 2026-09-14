import type { EventStatus } from "@prisma/client"
import { hasEventEnded } from "@/lib/event-time"

/** Why a visitor cannot book right now. `null` means booking is open. */
export type BookingClosedReason = "ENDED" | "CANCELLED" | "NOT_PUBLISHED" | "CLOSED" | "FULL"

export const BOOKING_CLOSED_MESSAGES: Record<BookingClosedReason, string> = {
  ENDED: "Booking is closed — this event has ended.",
  CANCELLED: "This event has been cancelled.",
  NOT_PUBLISHED: "Booking has not opened for this event yet.",
  CLOSED: "Booking is closed for this event.",
  FULL: "Event is full",
}

export const COMPLETED_IS_AUTOMATIC =
  "Completed is set automatically once the event ends — pick another status"

type EventTiming = { date: Date | string; startTime: string; endTime?: string | null }

/**
 * COMPLETED is never chosen by hand: an event completes itself once its end
 * time passes. `autoCompleteExpiredEvents` persists this, and this helper gives
 * the same answer at read time for rows the sweep has not reached yet.
 */
export function getEffectiveStatus(event: EventTiming & { status: EventStatus }): EventStatus {
  if (event.status === "CANCELLED" || event.status === "COMPLETED") return event.status
  return hasEventEnded(event) ? "COMPLETED" : event.status
}

/**
 * Booking stays open until the event's end time unless an admin closed it
 * (BOOKING_CLOSED / CANCELLED / not yet published) or every seat is taken.
 */
export function getBookingClosedReason(
  event: EventTiming & { status: EventStatus; isFull?: boolean }
): BookingClosedReason | null {
  const status = getEffectiveStatus(event)
  if (status === "COMPLETED") return "ENDED"
  if (status === "CANCELLED") return "CANCELLED"
  if (status === "ANNOUNCED") return "NOT_PUBLISHED"
  if (status === "BOOKING_CLOSED") return "CLOSED"
  if (event.isFull) return "FULL"
  return null
}

export function getBookingClosedMessage(reason: BookingClosedReason | null): string | null {
  return reason ? BOOKING_CLOSED_MESSAGES[reason] : null
}
