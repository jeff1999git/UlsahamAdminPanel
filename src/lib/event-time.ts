const IST_OFFSET_MINUTES = 5 * 60 + 30
const DAY_MS = 24 * 60 * 60 * 1000

type EventTiming = {
  date: Date | string
  startTime: string
  endTime?: string | null
}

function parseClockTime(time: string | null | undefined): { hours: number; minutes: number } | null {
  const match = typeof time === "string" ? time.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i) : null
  if (!match) return null
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const meridiem = match[3].toUpperCase()
  if (meridiem === "PM" && hours < 12) hours += 12
  if (meridiem === "AM" && hours === 12) hours = 0
  return { hours, minutes }
}

/** The UTC instant for hh:mm IST on the calendar day held by `date`. */
function istInstantOn(date: Date | string, hours: number, minutes: number): Date {
  const d = new Date(date)
  const utcMs =
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hours, minutes) -
    IST_OFFSET_MINUTES * 60 * 1000
  return new Date(utcMs)
}

/**
 * event.date holds only a calendar day (stored as UTC midnight of the day picked
 * in the admin panel); the actual start time lives separately in startTime
 * ("hh:mm AM/PM", India Standard Time). Combine them into the real UTC instant
 * the event starts so "has it started" reflects start time, not just midnight.
 */
export function getEventStartDateTime(event: EventTiming): Date {
  const start = parseClockTime(event.startTime) ?? { hours: 0, minutes: 0 }
  return istInstantOn(event.date, start.hours, start.minutes)
}

export function hasEventStarted(event: EventTiming): boolean {
  return getEventStartDateTime(event) <= new Date()
}

/**
 * The real UTC instant the event ends. endTime is "hh:mm AM/PM" IST on the same
 * calendar day as `date`, except for events that run past midnight (end at or
 * before start), which finish on the following day. A missing or unparsable
 * endTime falls back to the end of the event day (23:59 IST) so booking never
 * closes earlier than the day the admin picked.
 */
export function getEventEndDateTime(event: EventTiming): Date {
  const end = parseClockTime(event.endTime)
  if (!end) return istInstantOn(event.date, 23, 59)

  const endAt = istInstantOn(event.date, end.hours, end.minutes)
  const startAt = getEventStartDateTime(event)
  return endAt <= startAt ? new Date(endAt.getTime() + DAY_MS) : endAt
}

export function hasEventEnded(event: EventTiming): boolean {
  return getEventEndDateTime(event) <= new Date()
}
