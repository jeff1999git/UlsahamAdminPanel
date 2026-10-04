// Content and form correctness: event dates as IST days (the form's default,
// its minimum, the validation and what the server stores), slugs that belong
// to another event, images let go of by a save, a delete or a partner removal
// (queued, then deleted by the hourly housekeeping), the contacts printed on
// tickets, and the reconciliation script's pairing. Repositories and the
// Cloudinary SDK are replaced; nothing reaches a database or the network.
import { Prisma } from "@prisma/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { istDateString, toEventDay } from "@/lib/event-time"
import { createEventSchema, updateEventSchema } from "@/validators/event.validator"
import { DEFAULT_TICKET_CONTACTS, instagramHandle, ticketContacts } from "@/lib/ticket-contacts"
import { SLUG_IN_USE_MESSAGE } from "@/constants"
import {
  PRUNED,
  UNRECORDED,
  notesRecord,
  pairPayments,
  paymentsWithoutOrderMatch,
  type BookingRow,
  type RzpPayment,
} from "../scripts/lib/payment-pairing"

const m = vi.hoisted(() => ({
  // event.repository
  findEventById: vi.fn(),
  findEventBySlug: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  findEventImagesAmong: vi.fn(),
  // settings.repository
  queueImageDeletes: vi.fn(),
  findImageDeleteQueue: vi.fn(),
  removeQueuedImageDeletes: vi.fn(),
  // participant.repository
  pruneOldEventParticipants: vi.fn(),
  // the Cloudinary SDK
  destroy: vi.fn(),
}))

vi.mock("@/repositories/event.repository", () => ({
  findEventById: m.findEventById,
  findEventBySlug: m.findEventBySlug,
  createEvent: m.createEvent,
  updateEvent: m.updateEvent,
  deleteEvent: m.deleteEvent,
  findEventImagesAmong: m.findEventImagesAmong,
}))
vi.mock("@/repositories/settings.repository", () => ({
  queueImageDeletes: m.queueImageDeletes,
  findImageDeleteQueue: m.findImageDeleteQueue,
  removeQueuedImageDeletes: m.removeQueuedImageDeletes,
}))
vi.mock("@/repositories/participant.repository", () => ({
  pruneOldEventParticipants: m.pruneOldEventParticipants,
}))
vi.mock("cloudinary", () => ({
  v2: { config: vi.fn(), uploader: { destroy: m.destroy } },
}))

const HOUR = 60 * 60 * 1000
const ORIGINAL_TZ = process.env.TZ

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  // Each test starts from these answers; nothing set by an earlier test carries over.
  for (const mock of Object.values(m)) mock.mockReset()
  m.findEventBySlug.mockResolvedValue(null)
  m.createEvent.mockImplementation(async (data: Record<string, unknown>) => ({ id: "evt-new", ...data }))
  m.updateEvent.mockImplementation(async (id: string, data: Record<string, unknown>) => ({ id, ...data }))
  m.deleteEvent.mockResolvedValue({ id: "evt1" })
  m.findEventImagesAmong.mockResolvedValue([])
  m.queueImageDeletes.mockResolvedValue(undefined)
  m.findImageDeleteQueue.mockResolvedValue({ pending: [], partnerLogoIds: [] })
  m.removeQueuedImageDeletes.mockResolvedValue(undefined)
  m.pruneOldEventParticipants.mockResolvedValue(undefined)
  m.destroy.mockResolvedValue({ result: "ok" })
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  consoleError.mockRestore()
  vi.useRealTimers()
})

function at(instant: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(instant))
}

// The admins work in IST; Vercel runs in UTC. Every date rule must give the
// same answer in both, above all between 00:00 and 05:30 IST.
describe.each(["UTC", "Asia/Kolkata"])("event dates are IST days (TZ=%s)", (tz) => {
  beforeAll(() => {
    process.env.TZ = tz
  })
  afterAll(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ
    else process.env.TZ = ORIGINAL_TZ
  })

  it.each([
    ["00:30 IST on 4 Oct", "2026-10-03T19:00:00.000Z", "2026-10-04"],
    ["05:29 IST on 4 Oct", "2026-10-03T23:59:00.000Z", "2026-10-04"],
    ["05:30 IST on 4 Oct", "2026-10-04T00:00:00.000Z", "2026-10-04"],
    ["23:59 IST on 4 Oct", "2026-10-04T18:29:00.000Z", "2026-10-04"],
    ["00:00 IST on 5 Oct", "2026-10-04T18:30:00.000Z", "2026-10-05"],
  ])("today at %s is %s", (_name, now, day) => {
    expect(istDateString(new Date(now))).toBe(day)
    expect(toEventDay(new Date(now)).toISOString()).toBe(`${day}T00:00:00.000Z`)
    at(now)
    expect(istDateString()).toBe(day)
  })

  it("a day picked in the form (UTC midnight) is stored unchanged", () => {
    for (const day of ["2026-10-04", "2026-12-31", "2027-01-01"]) {
      expect(toEventDay(new Date(day)).toISOString()).toBe(`${day}T00:00:00.000Z`)
      expect(toEventDay(day).toISOString()).toBe(`${day}T00:00:00.000Z`)
    }
  })

  describe("the event form's validation", () => {
    const VALID = {
      name: "Test Event",
      slug: "test-event",
      description: "A description long enough to pass.",
      bannerImageUrl: "https://res.cloudinary.com/test-cloud/image/upload/banner.jpg",
      bannerImageId: "ulsaham/events/banner",
      venue: "Main Hall",
      startTime: "06:00 PM",
      endTime: "09:00 PM",
      isFree: true,
      status: "ANNOUNCED",
      featured: false,
    }

    function dateErrors(date: unknown) {
      const result = createEventSchema.safeParse({ ...VALID, date })
      return result.success ? [] : result.error.issues.filter((i) => i.path[0] === "date").map((i) => i.message)
    }

    it.each([undefined, "", "not a date"])("a cleared or unreadable date (%j) is reported as missing", (date) => {
      expect(dateErrors(date)).toEqual(["Event date is required"])
    })

    it("at 01:00 IST, today's IST date passes and yesterday's is refused", () => {
      at("2026-10-03T19:30:00.000Z") // 01:00 IST on 4 Oct
      expect(dateErrors(new Date("2026-10-04"))).toEqual([])
      expect(dateErrors(new Date("2026-10-03"))).toEqual(["Event date must be today or in the future"])
    })

    it("at 01:00 IST, the default (today's IST day) passes", () => {
      at("2026-10-03T19:30:00.000Z")
      expect(dateErrors(toEventDay(new Date()))).toEqual([])
    })

    it("an update may leave the date out", () => {
      expect(updateEventSchema.safeParse({ id: "evt1", name: "Renamed Event" }).success).toBe(true)
    })
  })
})

describe("saving an event", () => {
  const INPUT = {
    name: "Test Event",
    slug: "test-event",
    description: "A description long enough to pass.",
    bannerImageUrl: "https://res.cloudinary.com/test-cloud/image/upload/banner.jpg",
    bannerImageId: "ulsaham/events/banner",
    venue: "Main Hall",
    date: new Date("2026-10-04T00:00:00.000Z"),
    startTime: "06:00 PM",
    endTime: "09:00 PM",
    isFree: true,
    status: "ANNOUNCED" as const,
    featured: false,
  }
  const EXISTING = {
    id: "evt1",
    slug: "test-event",
    status: "PUBLISHED",
    date: new Date("2099-01-01T00:00:00.000Z"),
    startTime: "06:00 PM",
    endTime: "09:00 PM",
    bannerImageId: "ulsaham/events/old-banner",
    galleryImages: [
      { id: "ulsaham/events/g1", url: "https://res.cloudinary.com/x/g1.jpg" },
      { id: "ulsaham/events/g2", url: "https://res.cloudinary.com/x/g2.jpg" },
    ],
    complimentaryCodes: [],
    _count: { participants: 0 },
  }

  function slugTaken() {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.22.0",
      meta: { target: "Event_slug_key" },
    })
  }

  let service: typeof import("@/services/event.service")
  beforeEach(async () => {
    service = await import("@/services/event.service")
    m.findEventById.mockResolvedValue(EXISTING)
  })

  describe("the stored date", () => {
    it("a new event saved at 01:00 IST from an old form (date = now) is dated today, not yesterday", async () => {
      at("2026-10-03T19:30:00.000Z") // 01:00 IST on 4 Oct
      await service.createNewEvent({ ...INPUT, date: new Date() })
      expect(m.createEvent.mock.calls[0][0].date).toEqual(new Date("2026-10-04T00:00:00.000Z"))
    })

    it("a picked day is stored as it is", async () => {
      await service.createNewEvent({ ...INPUT, date: new Date("2026-11-20T00:00:00.000Z") })
      expect(m.createEvent.mock.calls[0][0].date).toEqual(new Date("2026-11-20T00:00:00.000Z"))
    })

    it("a changed date is stored as its IST day", async () => {
      await service.updateExistingEvent("evt1", { date: new Date("2099-02-01T20:00:00.000Z") })
      expect(m.updateEvent).toHaveBeenCalledWith("evt1", { date: new Date("2099-02-02T00:00:00.000Z") })
    })

    it("an unchanged date is not written, so an older event's stored instant keeps its day", async () => {
      const legacy = new Date("2099-01-01T19:30:00.000Z") // its UTC day, as the form shows it: 1 Jan
      m.findEventById.mockResolvedValue({ ...EXISTING, date: legacy })
      await service.updateExistingEvent("evt1", { date: new Date(legacy), name: "Renamed Event" })
      expect(m.updateEvent).toHaveBeenCalledWith("evt1", { name: "Renamed Event" })
    })
  })

  describe("the slug", () => {
    it("a slug another event holds is refused with a clear message, before any write", async () => {
      m.findEventBySlug.mockResolvedValue({ id: "evt2", slug: "taken" })
      await expect(service.updateExistingEvent("evt1", { slug: "taken", bannerImageUrl: "https://x/new.jpg", bannerImageId: "new" })).rejects.toThrow(
        SLUG_IN_USE_MESSAGE
      )
      expect(m.findEventBySlug).toHaveBeenCalledWith("taken")
      expect(m.updateEvent).not.toHaveBeenCalled()
      expect(m.queueImageDeletes).not.toHaveBeenCalled()
    })

    it("an unchanged slug is not looked up", async () => {
      await service.updateExistingEvent("evt1", { slug: "test-event" })
      expect(m.findEventBySlug).not.toHaveBeenCalled()
      expect(m.updateEvent).toHaveBeenCalledWith("evt1", { slug: "test-event" })
    })

    it("a slug taken at the same moment (the unique index refuses it) reads the same, and no image is released", async () => {
      m.updateEvent.mockRejectedValue(slugTaken())
      await expect(
        service.updateExistingEvent("evt1", { slug: "fresh", bannerImageUrl: "https://x/new.jpg", bannerImageId: "ulsaham/events/new-banner" })
      ).rejects.toThrow(SLUG_IN_USE_MESSAGE)
      expect(m.queueImageDeletes).not.toHaveBeenCalled()
    })

    it("another database error is passed on as it is", async () => {
      m.updateEvent.mockRejectedValue(new Error("connection reset"))
      await expect(service.updateExistingEvent("evt1", { name: "Renamed Event" })).rejects.toThrow("connection reset")
    })

    it("a create racing another for the same slug reads as a taken slug", async () => {
      m.createEvent.mockRejectedValue(slugTaken())
      await expect(service.createNewEvent(INPUT)).rejects.toThrow(SLUG_IN_USE_MESSAGE)
    })
  })

  describe("images let go of by a save", () => {
    it("are queued for deletion two hours on, only after the update succeeded", async () => {
      at("2026-10-04T06:00:00.000Z")
      await service.updateExistingEvent("evt1", {
        bannerImageUrl: "https://res.cloudinary.com/x/new.jpg",
        bannerImageId: "ulsaham/events/new-banner",
        galleryImages: [{ id: "ulsaham/events/g2", url: "https://res.cloudinary.com/x/g2.jpg" }],
      })

      const deleteAfter = new Date(Date.now() + 2 * HOUR)
      expect(m.queueImageDeletes).toHaveBeenCalledWith([
        { publicId: "ulsaham/events/old-banner", deleteAfter },
        { publicId: "ulsaham/events/g1", deleteAfter },
      ])
      expect(m.updateEvent.mock.invocationCallOrder[0]).toBeLessThan(m.queueImageDeletes.mock.invocationCallOrder[0])
      expect(m.destroy).not.toHaveBeenCalled()
    })

    it("a failed update releases nothing", async () => {
      m.updateEvent.mockRejectedValue(new Error("connection reset"))
      await expect(
        service.updateExistingEvent("evt1", { galleryImages: [] })
      ).rejects.toThrow("connection reset")
      expect(m.queueImageDeletes).not.toHaveBeenCalled()
    })

    it("a save that keeps every image queues nothing", async () => {
      await service.updateExistingEvent("evt1", {
        bannerImageUrl: "https://res.cloudinary.com/x/old.jpg",
        bannerImageId: "ulsaham/events/old-banner",
        galleryImages: EXISTING.galleryImages,
      })
      expect(m.queueImageDeletes).not.toHaveBeenCalled()
    })

    it("a queue that cannot be written does not fail the save that already happened", async () => {
      m.queueImageDeletes.mockRejectedValue(new Error("connection reset"))
      const event = await service.updateExistingEvent("evt1", { galleryImages: [] })
      expect(event).toMatchObject({ id: "evt1" })
      expect(consoleError).toHaveBeenCalled()
    })
  })

  describe("deleting", () => {
    it("an event with bookings is cancelled, keeps its images and says so", async () => {
      m.findEventById.mockResolvedValue({ ...EXISTING, _count: { participants: 4 } })
      expect(await service.deleteEventWithCleanup("evt1")).toEqual({ outcome: "cancelled", bookings: 4 })
      expect(m.updateEvent).toHaveBeenCalledWith("evt1", { status: "CANCELLED" })
      expect(m.deleteEvent).not.toHaveBeenCalled()
      expect(m.queueImageDeletes).not.toHaveBeenCalled()
    })

    it("an event without bookings is deleted, then its images are queued", async () => {
      expect(await service.deleteEventWithCleanup("evt1")).toEqual({ outcome: "deleted" })
      expect(m.deleteEvent).toHaveBeenCalledWith("evt1")
      const queued = m.queueImageDeletes.mock.calls[0][0].map((e: { publicId: string }) => e.publicId)
      expect(queued).toEqual(["ulsaham/events/old-banner", "ulsaham/events/g1", "ulsaham/events/g2"])
      expect(m.deleteEvent.mock.invocationCallOrder[0]).toBeLessThan(m.queueImageDeletes.mock.invocationCallOrder[0])
      expect(m.destroy).not.toHaveBeenCalled()
    })
  })
})

describe("the hourly image deletion", () => {
  const NOW = new Date("2026-10-04T12:00:00.000Z")
  const due = (publicId: string, hoursAgo = 1) => ({ publicId, deleteAfter: new Date(NOW.getTime() - hoursAgo * HOUR) })

  let housekeeping: typeof import("@/services/housekeeping.service")
  beforeEach(async () => {
    housekeeping = await import("@/services/housekeeping.service")
  })

  it("scheduling drops empty and repeated ids", async () => {
    await housekeeping.scheduleImageDeletes(["img/a", "", null, undefined, "img/a", "img/b"], NOW)
    const deleteAfter = new Date(NOW.getTime() + 2 * HOUR)
    expect(m.queueImageDeletes).toHaveBeenCalledWith([
      { publicId: "img/a", deleteAfter },
      { publicId: "img/b", deleteAfter },
    ])
    await housekeeping.scheduleImageDeletes([null, ""], NOW)
    expect(m.queueImageDeletes).toHaveBeenCalledTimes(1)
  })

  it("deletes what is due, purging the CDN, and takes it off the queue", async () => {
    m.findImageDeleteQueue.mockResolvedValue({
      pending: [due("img/a"), { publicId: "img/later", deleteAfter: new Date(NOW.getTime() + HOUR) }],
      partnerLogoIds: [],
    })
    await housekeeping.deleteDueImages(NOW)
    expect(m.destroy).toHaveBeenCalledTimes(1)
    expect(m.destroy).toHaveBeenCalledWith("img/a", { invalidate: true })
    expect(m.findEventImagesAmong).toHaveBeenCalledWith(["img/a"])
    expect(m.removeQueuedImageDeletes).toHaveBeenCalledWith(["img/a"], NOW)
  })

  it("keeps an image an event or a partner uses again, and takes it off the queue", async () => {
    m.findImageDeleteQueue.mockResolvedValue({
      pending: [due("img/event"), due("img/logo"), due("img/free")],
      partnerLogoIds: ["img/logo"],
    })
    m.findEventImagesAmong.mockResolvedValue(["img/event"])
    await housekeeping.deleteDueImages(NOW)
    expect(m.destroy.mock.calls.map(([id]) => id)).toEqual(["img/free"])
    expect(m.removeQueuedImageDeletes.mock.calls[0][0].sort()).toEqual(["img/event", "img/free", "img/logo"])
  })

  it("an image already gone counts as deleted", async () => {
    m.findImageDeleteQueue.mockResolvedValue({ pending: [due("img/a")], partnerLogoIds: [] })
    m.destroy.mockResolvedValue({ result: "not found" })
    await housekeeping.deleteDueImages(NOW)
    expect(m.removeQueuedImageDeletes).toHaveBeenCalledWith(["img/a"], NOW)
  })

  it("a deletion that fails stays queued for the next run", async () => {
    m.findImageDeleteQueue.mockResolvedValue({ pending: [due("img/a"), due("img/b")], partnerLogoIds: [] })
    m.destroy.mockImplementation(async (id: string) => {
      if (id === "img/a") throw new Error("Cloudinary unreachable")
      return { result: "error" }
    })
    await housekeeping.deleteDueImages(NOW)
    expect(m.removeQueuedImageDeletes).not.toHaveBeenCalled()
  })

  it("gives up on a deletion that has failed for a week", async () => {
    m.findImageDeleteQueue.mockResolvedValue({ pending: [due("img/old", 8 * 24), due("img/new")], partnerLogoIds: [] })
    m.destroy.mockRejectedValue(new Error("Cloudinary unreachable"))
    await housekeeping.deleteDueImages(NOW)
    expect(m.removeQueuedImageDeletes).toHaveBeenCalledWith(["img/old"], NOW)
  })

  it("an image queued twice is deleted once; a run deletes at most 25, oldest first", async () => {
    const pending = Array.from({ length: 30 }, (_, i) => due(`img/${i}`, 30 - i))
    m.findImageDeleteQueue.mockResolvedValue({ pending: [...pending, due("img/0", 1)], partnerLogoIds: [] })
    await housekeeping.deleteDueImages(NOW)
    expect(m.destroy).toHaveBeenCalledTimes(25)
    expect(m.destroy.mock.calls.map(([id]) => id)).toEqual(Array.from({ length: 25 }, (_, i) => `img/${i}`))
  })

  it("with nothing due, asks nothing more", async () => {
    m.findImageDeleteQueue.mockResolvedValue({ pending: [{ publicId: "img/later", deleteAfter: new Date(NOW.getTime() + HOUR) }], partnerLogoIds: [] })
    await housekeeping.deleteDueImages(NOW)
    expect(m.findEventImagesAmong).not.toHaveBeenCalled()
    expect(m.destroy).not.toHaveBeenCalled()
    expect(m.removeQueuedImageDeletes).not.toHaveBeenCalled()
  })

  it("the housekeeping runs the image deletion even when the prune fails", async () => {
    m.pruneOldEventParticipants.mockRejectedValue(new Error("prune failed"))
    // The housekeeping reads the real clock.
    m.findImageDeleteQueue.mockResolvedValue({ pending: [{ publicId: "img/a", deleteAfter: new Date(Date.now() - HOUR) }], partnerLogoIds: [] })
    await housekeeping.runEventsHousekeeping()
    expect(m.pruneOldEventParticipants).toHaveBeenCalledTimes(1)
    expect(m.destroy).toHaveBeenCalledWith("img/a", { invalidate: true })
    expect(consoleError).toHaveBeenCalledWith("prune-event-participants failed:", expect.any(Error))
  })

  it("the housekeeping prunes even when the image deletion fails", async () => {
    m.findImageDeleteQueue.mockRejectedValue(new Error("connection reset"))
    await expect(housekeeping.runEventsHousekeeping()).resolves.toBeUndefined()
    expect(m.pruneOldEventParticipants).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith("delete-due-images failed:", expect.any(Error))
  })
})

describe("deleteImage", () => {
  it.each<[string, () => void, boolean]>([
    ["deleted", () => m.destroy.mockResolvedValue({ result: "ok" }), true],
    ["already gone", () => m.destroy.mockResolvedValue({ result: "not found" }), true],
    ["refused", () => m.destroy.mockResolvedValue({ result: "error" }), false],
    ["unreachable", () => m.destroy.mockRejectedValue(new Error("timeout")), false],
  ])("%s", async (_name, answer, gone) => {
    answer()
    const { deleteImage } = await import("@/lib/cloudinary")
    expect(await deleteImage("img/a")).toBe(gone)
    expect(m.destroy).toHaveBeenCalledWith("img/a", { invalidate: true })
  })
})

describe("the contacts printed on tickets", () => {
  it.each<[string | null | undefined, string | null]>([
    ["https://instagram.com/ulsaham_", "@ulsaham_"],
    ["https://www.instagram.com/ulsaham.events/?igsh=abc", "@ulsaham.events"],
    ["https://m.instagram.com/Ulsaham_Official", "@Ulsaham_Official"],
    ["@ulsaham_", "@ulsaham_"],
    ["ulsaham_", "@ulsaham_"],
    ["https://www.instagram.com/p/C1abc/", null],
    ["https://www.instagram.com/", null],
    ["https://linktr.ee/ulsaham", null],
    ["not a handle!", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("Instagram %j prints as %j", (value, handle) => {
    expect(instagramHandle(value)).toBe(handle)
  })

  it("prints Settings' phone and Instagram", () => {
    expect(ticketContacts({ phone: "9876543210", instagram: "https://instagram.com/ulsaham_events" })).toEqual({
      phone: "9876543210",
      instagram: "@ulsaham_events",
    })
  })

  it("falls back, field by field, to what tickets printed before", () => {
    expect(ticketContacts(null)).toEqual(DEFAULT_TICKET_CONTACTS)
    expect(ticketContacts({ phone: null, instagram: null })).toEqual({ phone: "9446266011", instagram: "@ulsaham_" })
    expect(ticketContacts({ phone: "  ", instagram: "https://instagram.com/new_handle" })).toEqual({
      phone: "9446266011",
      instagram: "@new_handle",
    })
    expect(ticketContacts({ phone: "9876543210", instagram: "https://example.com/x" })).toEqual({
      phone: "9876543210",
      instagram: "@ulsaham_",
    })
  })
})

describe("the unrecorded-payments report's pairing", () => {
  const NOW = new Date("2026-10-04T12:00:00.000Z")
  // archivedParticipantCount is what the prune writes before deleting bookings.
  const EVENTS = [
    { id: "evtNow", name: "This week", date: new Date("2026-10-02T00:00:00.000Z"), archivedParticipantCount: 0 },
    { id: "evtOld", name: "Last month", date: new Date("2026-09-01T00:00:00.000Z"), archivedParticipantCount: 3 },
    { id: "evtOldLive", name: "Old, not pruned yet", date: new Date("2026-09-10T00:00:00.000Z"), archivedParticipantCount: 0 },
    { id: "evtOldEmpty", name: "Old, never booked", date: new Date("2026-09-01T00:00:00.000Z"), archivedParticipantCount: 0 },
  ]
  const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

  function payment(id: string, overrides: Partial<RzpPayment> = {}): RzpPayment {
    return { id, order_id: `order_${id}`, status: "captured", amount: 50000, created_at: at("2026-10-01T10:00:00.000Z"), notes: [], ...overrides }
  }
  function booking(overrides: Partial<BookingRow>): BookingRow {
    return {
      eventId: "evtNow",
      phone: "9876543210",
      ticketCode: "UE-AAAAAA",
      amountPaid: true,
      registeredAt: new Date("2026-10-01T10:00:00.000Z"),
      paymentOrderId: null,
      ...overrides,
    }
  }
  const notes = (eventId: string, extra: Record<string, string> = {}) => ({ eventId, phone: "9876543210", name: "Buyer", ...extra })

  it("a payment whose order a booking holds is recorded without fetching its order", () => {
    const payments = [payment("p1")]
    const bookings = [booking({ paymentOrderId: "order_p1" })]
    expect(paymentsWithoutOrderMatch(payments, bookings)).toEqual([])
    expect(pairPayments({ payments, bookings, events: EVENTS, orderNotes: new Map(), now: NOW })).toEqual({ recorded: 1, rows: [] })
  })

  it("reads an unpaired payment from its order's notes, not from the payment's own", () => {
    const payments = [payment("p1", { notes: notes("evtOld") })]
    const orderNotes = new Map([["order_p1", notes("evtNow")]])
    const { rows } = pairPayments({ payments, bookings: [], events: EVENTS, orderNotes, now: NOW })
    expect(rows).toEqual([expect.objectContaining({ status: UNRECORDED, event: "This week", paymentId: "p1", amountINR: "500.00" })])
  })

  it("uses the payment's notes when its order could not be fetched", () => {
    const payments = [payment("p1", { notes: notes("evtNow") })]
    const { rows } = pairPayments({ payments, bookings: [], events: EVENTS, orderNotes: new Map(), now: NOW })
    expect(rows).toEqual([expect.objectContaining({ status: UNRECORDED, event: "This week" })])
  })

  it("labels a payment for an event over two weeks past, whose bookings are gone, as pruned", () => {
    const payments = [payment("p1"), payment("p2")]
    const orderNotes = new Map([
      ["order_p1", notes("evtOld")],
      ["order_p2", notes("evtNow")],
    ])
    const { recorded, rows } = pairPayments({ payments, bookings: [], events: EVENTS, orderNotes, now: NOW })
    expect(recorded).toBe(0)
    // Unrecorded first: those are the ones to act on.
    expect(rows.map((r) => [r.paymentId, r.status])).toEqual([
      ["p2", UNRECORDED],
      ["p1", PRUNED],
    ])
  })

  it("an old event that never had a booking was never pruned, so its payment is unrecorded", () => {
    const payments = [payment("p1")]
    const orderNotes = new Map([["order_p1", notes("evtOldEmpty")]])
    const { rows } = pairPayments({ payments, bookings: [], events: EVENTS, orderNotes, now: NOW })
    expect(rows).toEqual([expect.objectContaining({ status: UNRECORDED, event: "Old, never booked" })])
  })

  it("an old event whose bookings are still there (not pruned yet) is checked as usual", () => {
    const payments = [payment("p1")]
    const orderNotes = new Map([["order_p1", notes("evtOldLive", { phone: "9000000000" })]])
    const bookings = [booking({ eventId: "evtOldLive", paymentOrderId: "order_other" })]
    const { rows } = pairPayments({ payments, bookings, events: EVENTS, orderNotes, now: NOW })
    expect(rows).toEqual([expect.objectContaining({ status: UNRECORDED, event: "Old, not pruned yet" })])
  })

  it("pairs a re-payment by its ticket and an older booking by event, phone and time", () => {
    const payments = [payment("p1"), payment("p2")]
    const orderNotes = new Map([
      ["order_p1", notes("evtNow", { ticketCode: "ue-repaid" })],
      ["order_p2", notes("evtNow")],
    ])
    const bookings = [booking({ ticketCode: "UE-REPAID" }), booking({ ticketCode: "UE-LEGACY", registeredAt: new Date("2026-10-01T10:20:00.000Z") })]
    expect(pairPayments({ payments, bookings, events: EVENTS, orderNotes, now: NOW })).toEqual({ recorded: 2, rows: [] })
  })

  it("skips a payment that is not for a ticket", () => {
    const { recorded, rows } = pairPayments({
      payments: [payment("p1", { order_id: null })],
      bookings: [],
      events: EVENTS,
      orderNotes: new Map(),
      now: NOW,
    })
    expect({ recorded, rows }).toEqual({ recorded: 0, rows: [] })
  })

  it("reads Razorpay's notes, which are [] when empty", () => {
    expect(notesRecord([])).toEqual({})
    expect(notesRecord(null)).toEqual({})
    expect(notesRecord({ eventId: "evt1", age: 30 })).toEqual({ eventId: "evt1", age: "30" })
  })
})
