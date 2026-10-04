// Event timing and booking state must not depend on the server's time zone:
// Vercel runs in UTC, a developer's machine in IST. Every case runs under both,
// with a fixed clock, and pays attention to 00:00-05:30 IST, when the IST date
// is one day ahead of the UTC date.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { EventStatus } from "@prisma/client"
import {
  getEventEndDateTime,
  getEventStartDateTime,
  hasEventEnded,
  hasEventStarted,
} from "@/lib/event-time"
import {
  BOOKING_CLOSED_MESSAGES,
  getBookingClosedMessage,
  getBookingClosedReason,
  getEffectiveStatus,
} from "@/lib/event-status"
import { formatDate, formatDateTime } from "@/lib/utils"

// event.date is the picked calendar day at UTC midnight.
const OCT_3 = "2026-10-03T00:00:00.000Z"
const OCT_4 = "2026-10-04T00:00:00.000Z"
const iso = (d: Date) => d.toISOString()

const ORIGINAL_TZ = process.env.TZ

describe.each([
  ["UTC", 0],
  ["Asia/Kolkata", -330],
])("TZ=%s", (tz, offsetMinutes) => {
  beforeAll(() => {
    process.env.TZ = tz
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  afterAll(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ
    else process.env.TZ = ORIGINAL_TZ
  })

  function at(instant: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(instant))
  }

  it("really runs in this zone", () => {
    expect(new Date(OCT_3).getTimezoneOffset()).toBe(offsetMinutes)
  })

  describe("getEventStartDateTime", () => {
    it.each([
      ["06:30 PM", "2026-10-03T13:00:00.000Z"],
      ["12:30 PM", "2026-10-03T07:00:00.000Z"],
      ["9:05 am", "2026-10-03T03:35:00.000Z"],
      ["05:30 AM", "2026-10-03T00:00:00.000Z"],
      // 00:00-05:29 IST falls on the previous UTC day.
      ["12:00 AM", "2026-10-02T18:30:00.000Z"],
      ["01:00 AM", "2026-10-02T19:30:00.000Z"],
      ["05:29 AM", "2026-10-02T23:59:00.000Z"],
      ["11:59 PM", "2026-10-03T18:29:00.000Z"],
    ])("%s IST on 3 Oct", (startTime, expected) => {
      expect(iso(getEventStartDateTime({ date: OCT_3, startTime }))).toBe(expected)
    })

    it("accepts the date as a Date or as a YYYY-MM-DD string", () => {
      const expected = "2026-10-03T13:00:00.000Z"
      expect(iso(getEventStartDateTime({ date: new Date(OCT_3), startTime: "06:30 PM" }))).toBe(expected)
      expect(iso(getEventStartDateTime({ date: "2026-10-03", startTime: "06:30 PM" }))).toBe(expected)
    })

    it("treats an unreadable start time as midnight IST", () => {
      expect(iso(getEventStartDateTime({ date: OCT_3, startTime: "evening" }))).toBe("2026-10-02T18:30:00.000Z")
    })
  })

  describe("getEventEndDateTime", () => {
    it("ends on the event day", () => {
      expect(iso(getEventEndDateTime({ date: OCT_3, startTime: "06:00 PM", endTime: "09:00 PM" }))).toBe(
        "2026-10-03T15:30:00.000Z"
      )
    })

    it("rolls an end at or before the start over to the next day", () => {
      expect(iso(getEventEndDateTime({ date: OCT_3, startTime: "10:00 PM", endTime: "02:00 AM" }))).toBe(
        "2026-10-03T20:30:00.000Z"
      )
      expect(iso(getEventEndDateTime({ date: OCT_3, startTime: "06:00 PM", endTime: "06:00 PM" }))).toBe(
        "2026-10-04T12:30:00.000Z"
      )
    })

    it("falls back to 23:59 IST when the end time is missing or unreadable", () => {
      const endOfDay = "2026-10-03T18:29:00.000Z"
      expect(iso(getEventEndDateTime({ date: OCT_3, startTime: "06:00 PM" }))).toBe(endOfDay)
      expect(iso(getEventEndDateTime({ date: OCT_3, startTime: "06:00 PM", endTime: null }))).toBe(endOfDay)
      expect(iso(getEventEndDateTime({ date: OCT_3, startTime: "06:00 PM", endTime: "late" }))).toBe(endOfDay)
    })
  })

  describe("hasEventStarted / hasEventEnded", () => {
    const evening = { date: OCT_3, startTime: "06:00 PM", endTime: "09:00 PM" }

    it("flips exactly at the start and end instants", () => {
      at("2026-10-03T12:29:59.999Z")
      expect(hasEventStarted(evening)).toBe(false)
      at("2026-10-03T12:30:00.000Z")
      expect(hasEventStarted(evening)).toBe(true)
      at("2026-10-03T15:29:59.999Z")
      expect(hasEventEnded(evening)).toBe(false)
      at("2026-10-03T15:30:00.000Z")
      expect(hasEventEnded(evening)).toBe(true)
    })

    it("at 01:30 IST on 4 Oct (still 3 Oct in UTC), a 4 Oct 01:00 AM event has started", () => {
      at("2026-10-03T20:00:00.000Z")
      expect(hasEventStarted({ date: OCT_4, startTime: "01:00 AM" })).toBe(true)
      expect(hasEventStarted({ date: OCT_4, startTime: "02:00 AM" })).toBe(false)
    })

    it("at 01:30 IST on 4 Oct, a 3 Oct event with no end time has ended and a 4 Oct one has not", () => {
      at("2026-10-03T20:00:00.000Z")
      expect(hasEventEnded({ date: OCT_3, startTime: "06:00 PM" })).toBe(true)
      expect(hasEventEnded({ date: OCT_4, startTime: "06:00 PM" })).toBe(false)
    })

    it("an event running past midnight is still on at 01:30 IST the next day", () => {
      at("2026-10-03T20:00:00.000Z")
      expect(hasEventEnded({ date: OCT_3, startTime: "10:00 PM", endTime: "02:00 AM" })).toBe(false)
      at("2026-10-03T20:30:00.000Z")
      expect(hasEventEnded({ date: OCT_3, startTime: "10:00 PM", endTime: "02:00 AM" })).toBe(true)
    })
  })

  describe("getEffectiveStatus", () => {
    const timing = { date: OCT_3, startTime: "06:00 PM", endTime: "11:30 PM" }

    it.each<EventStatus>(["ANNOUNCED", "PUBLISHED", "BOOKING_CLOSED"])(
      "%s stays until the end time (23:30 IST), then reads COMPLETED",
      (status) => {
        at("2026-10-03T17:59:59.999Z")
        expect(getEffectiveStatus({ ...timing, status })).toBe(status)
        at("2026-10-03T18:00:00.000Z")
        expect(getEffectiveStatus({ ...timing, status })).toBe("COMPLETED")
      }
    )

    it.each<EventStatus>(["CANCELLED", "COMPLETED"])("%s never changes", (status) => {
      at("2026-10-01T00:00:00.000Z")
      expect(getEffectiveStatus({ ...timing, status })).toBe(status)
      at("2026-10-05T00:00:00.000Z")
      expect(getEffectiveStatus({ ...timing, status })).toBe(status)
    })
  })

  describe("getBookingClosedReason", () => {
    const timing = { date: OCT_4, startTime: "06:00 PM", endTime: "09:00 PM" }
    const beforeEvent = "2026-10-03T20:00:00.000Z" // 01:30 IST on 4 Oct
    const afterEvent = "2026-10-04T15:30:00.000Z" // 21:00 IST on 4 Oct

    it.each<[EventStatus, boolean, string | null]>([
      ["PUBLISHED", false, null],
      ["PUBLISHED", true, "FULL"],
      ["ANNOUNCED", false, "NOT_PUBLISHED"],
      ["BOOKING_CLOSED", false, "CLOSED"],
      ["CANCELLED", false, "CANCELLED"],
      ["CANCELLED", true, "CANCELLED"],
      ["COMPLETED", false, "ENDED"],
    ])("%s (full: %s) before the event: %s", (status, isFull, reason) => {
      at(beforeEvent)
      expect(getBookingClosedReason({ ...timing, status, isFull })).toBe(reason)
    })

    it("stays open on the IST event day before 05:30, when UTC is still the day before", () => {
      at("2026-10-03T23:59:00.000Z") // 05:29 IST on 4 Oct
      expect(getBookingClosedReason({ ...timing, status: "PUBLISHED" })).toBeNull()
    })

    it("closes as ENDED at the end time, even when full or closed by hand", () => {
      at(afterEvent)
      expect(getBookingClosedReason({ ...timing, status: "PUBLISHED" })).toBe("ENDED")
      expect(getBookingClosedReason({ ...timing, status: "PUBLISHED", isFull: true })).toBe("ENDED")
      expect(getBookingClosedReason({ ...timing, status: "BOOKING_CLOSED" })).toBe("ENDED")
      expect(getBookingClosedReason({ ...timing, status: "CANCELLED" })).toBe("CANCELLED")
    })

    it("maps every reason to its message", () => {
      expect(getBookingClosedMessage(null)).toBeNull()
      for (const [reason, message] of Object.entries(BOOKING_CLOSED_MESSAGES)) {
        expect(getBookingClosedMessage(reason as keyof typeof BOOKING_CLOSED_MESSAGES)).toBe(message)
      }
    })
  })

  describe("formatDate / formatDateTime show IST", () => {
    it("shows the picked day for a stored event date", () => {
      expect(formatDate(OCT_3)).toBe("03 Oct 2026")
      expect(formatDate(new Date(OCT_4))).toBe("04 Oct 2026")
    })

    it("shows the IST day for an instant between 00:00 and 05:30 IST", () => {
      expect(formatDate("2026-10-03T20:00:00.000Z")).toBe("04 Oct 2026")
      expect(formatDateTime("2026-10-03T20:00:00.000Z")).toBe("04 Oct 2026, 01:30 AM")
      expect(formatDateTime("2026-10-03T18:30:00.000Z")).toBe("04 Oct 2026, 12:00 AM")
      expect(formatDateTime("2026-10-03T18:29:00.000Z")).toBe("03 Oct 2026, 11:59 PM")
    })
  })
})
