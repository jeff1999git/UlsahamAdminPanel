const IST_OFFSET_MINUTES = 5 * 60 + 30

function parseStartTime(startTime: string): { hours: number; minutes: number } {
  const match = startTime?.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i)
  if (!match) return { hours: 0, minutes: 0 }
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const meridiem = match[3].toUpperCase()
  if (meridiem === "PM" && hours < 12) hours += 12
  if (meridiem === "AM" && hours === 12) hours = 0
  return { hours, minutes }
}

/**
 * event.date holds only a calendar day (stored as UTC midnight of the day picked
 * in the admin panel); the actual start time lives separately in startTime
 * ("hh:mm AM/PM", India Standard Time). Combine them into the real UTC instant
 * the event starts so "has it started" reflects start time, not just midnight.
 */
export function getEventStartDateTime(event: { date: Date | string; startTime: string }): Date {
  const d = new Date(event.date)
  const { hours, minutes } = parseStartTime(event.startTime)
  const utcMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hours, minutes) - IST_OFFSET_MINUTES * 60 * 1000
  return new Date(utcMs)
}

export function hasEventStarted(event: { date: Date | string; startTime: string }): boolean {
  return getEventStartDateTime(event) <= new Date()
}
