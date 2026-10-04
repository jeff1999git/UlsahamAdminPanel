// The repository queries behind chest numbers, the dashboard figures, the
// fortnightly prune, the public event detail and the settings row (brand
// partners and the image deletion queue), plus the order amount a paid
// booking records. Prisma and the Razorpay SDK are replaced with stubs that
// answer only what each test sets; anything else fails loudly.
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  allocateCompetitionNumber,
  allocateCompetitionNumbers,
  findBookableEventBySlug,
  findEventImagesAmong,
  findPublishedEventBySlug,
  findTicketEventBySlug,
  getDashboardStats,
  listPublishedEvents,
} from "@/repositories/event.repository"
import { pruneOldEventParticipants } from "@/repositories/participant.repository"
import {
  addBrandPartner,
  findImageDeleteQueue,
  findTicketContactSettings,
  getSettings,
  queueImageDeletes,
  removeBrandPartner,
  removeQueuedImageDeletes,
  upsertSettings,
} from "@/repositories/settings.repository"
import { bookingFromOrderNotes, chargeFields, fetchOrderBooking } from "@/lib/razorpay"
import { GET as eventDetail } from "@/app/api/public/events/[slug]/route"

const m = vi.hoisted(() => ({
  runCommandRaw: vi.fn(),
  event: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    updateMany: vi.fn(),
  },
  participant: {
    aggregate: vi.fn(),
    groupBy: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  settings: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  ordersFetch: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { $runCommandRaw: m.runCommandRaw, event: m.event, participant: m.participant, settings: m.settings },
}))
vi.mock("razorpay", () => ({
  default: class {
    orders = { fetch: m.ordersFetch }
  },
}))

const mocks = () => [
  m.runCommandRaw,
  m.ordersFetch,
  ...Object.values(m.event),
  ...Object.values(m.participant),
  ...Object.values(m.settings),
]

beforeEach(() => {
  // Each test starts from these answers; nothing set by an earlier test carries over.
  for (const mock of mocks()) mock.mockReset()
})

describe("chest numbers come from one atomic findAndModify", () => {
  it("takes a block of numbers and returns the first", async () => {
    m.runCommandRaw.mockResolvedValue({ lastErrorObject: { n: 1, updatedExisting: true }, value: { _id: { $oid: "a".repeat(24) }, lastCompetitionNumber: 7 }, ok: 1 })

    expect(await allocateCompetitionNumbers("a".repeat(24), 3)).toBe(1005)
    expect(m.runCommandRaw).toHaveBeenCalledWith({
      findAndModify: "Event",
      query: { _id: { $oid: "a".repeat(24) } },
      update: { $inc: { lastCompetitionNumber: 3 } },
      new: true,
      fields: { lastCompetitionNumber: 1 },
    })
  })

  it("a single booking takes the number the counter now holds", async () => {
    m.runCommandRaw.mockResolvedValue({ value: { lastCompetitionNumber: 1 }, ok: 1 })
    expect(await allocateCompetitionNumber("b".repeat(24))).toBe(1001)
    expect(m.runCommandRaw.mock.calls[0][0]).toMatchObject({ update: { $inc: { lastCompetitionNumber: 1 } }, new: true })
  })

  it("reads the counter in Extended JSON too", async () => {
    m.runCommandRaw.mockResolvedValueOnce({ value: { lastCompetitionNumber: { $numberInt: "12" } }, ok: 1 })
    expect(await allocateCompetitionNumber("c".repeat(24))).toBe(1012)
    m.runCommandRaw.mockResolvedValueOnce({ value: { lastCompetitionNumber: { $numberLong: "40" } }, ok: 1 })
    expect(await allocateCompetitionNumbers("c".repeat(24), 2)).toBe(1039)
  })

  it("fails when the event is gone", async () => {
    m.runCommandRaw.mockResolvedValue({ lastErrorObject: { n: 0 }, value: null, ok: 1 })
    await expect(allocateCompetitionNumber("d".repeat(24))).rejects.toThrow("Event not found")
  })
})

describe("cancelled events", () => {
  function eventRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "evt1",
      name: "Test Event",
      slug: "test-event",
      description: "About the event",
      bannerImageUrl: "https://res.cloudinary.com/test-cloud/image/upload/banner.jpg",
      bannerImageId: "ulsaham/events/banner",
      venue: "Main Hall",
      venueLink: null,
      date: new Date("2099-01-01T00:00:00.000Z"),
      startTime: "06:00 PM",
      endTime: "09:00 PM",
      isFree: false,
      amount: 500,
      earlyBirdAmount: null,
      isEarlyBird: false,
      gstEnabled: false,
      platformFeeEnabled: true,
      isCompetition: false,
      participationType: "INDIVIDUAL",
      groupExtraAmount: null,
      competitionInstructions: null,
      competitionNotes: null,
      lastCompetitionNumber: 0,
      status: "PUBLISHED",
      capacity: 100,
      featured: false,
      couponCodes: [],
      complimentaryCodes: [],
      galleryImages: [],
      archivedParticipantCount: 0,
      archivedRevenuePaise: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-02T00:00:00.000Z"),
      ...overrides,
    }
  }

  it("the detail lookup finds a cancelled event; drafts stay hidden", async () => {
    m.event.findFirst.mockResolvedValue(null)
    await findPublishedEventBySlug("test-event")
    const { where } = m.event.findFirst.mock.calls[0][0]
    expect(where.slug).toBe("test-event")
    expect([...where.status.in].sort()).toEqual(["BOOKING_CLOSED", "CANCELLED", "COMPLETED", "PUBLISHED"])
  })

  it("the booking routes find a cancelled event too, so order, register and apply-coupon refuse it with 410", async () => {
    m.event.findFirst.mockResolvedValue(null)
    await findBookableEventBySlug("test-event")
    const { where } = m.event.findFirst.mock.calls[0][0]
    expect(where.slug).toBe("test-event")
    expect([...where.status.in].sort()).toEqual(["BOOKING_CLOSED", "CANCELLED", "COMPLETED", "PUBLISHED"])
  })

  it("payment/status does not find a cancelled event or a draft, so it answers 404 for both", async () => {
    m.event.findFirst.mockResolvedValue(null)
    await findTicketEventBySlug("test-event")
    const { where } = m.event.findFirst.mock.calls[0][0]
    expect(where.slug).toBe("test-event")
    expect([...where.status.in].sort()).toEqual(["BOOKING_CLOSED", "COMPLETED", "PUBLISHED"])
  })

  it("the public lists still leave cancelled events out", async () => {
    m.event.findMany.mockResolvedValue([])
    await listPublishedEvents({ upcoming: true })
    expect(m.event.findMany.mock.calls[0][0].where.status).toEqual({ in: ["PUBLISHED", "BOOKING_CLOSED"] })
  })

  it("GET /api/public/events/[slug] answers a cancelled event with its notice and booking shut", async () => {
    m.event.findFirst.mockResolvedValue(eventRow({ status: "CANCELLED" }))
    m.participant.aggregate.mockResolvedValue({ _sum: { numberOfParticipants: 12 } })

    const response = await eventDetail(new NextRequest("http://localhost/api/public/events/test-event"), {
      params: Promise.resolve({ slug: "test-event" }),
    })

    expect(response.status).toBe(200)
    const { event } = (await response.json()).data
    expect(event).toMatchObject({
      slug: "test-event",
      status: "CANCELLED",
      bookingOpen: false,
      bookingClosedReason: "CANCELLED",
      bookingClosedMessage: "This event has been cancelled.",
      registeredCount: 12,
    })
    expect(event).not.toHaveProperty("archivedRevenuePaise")
  })
})

describe("dashboard figures", () => {
  function answerDashboard() {
    m.event.count.mockImplementation(async (args?: { where?: { date?: unknown } }) => (!args ? 12 : args.where?.date ? 3 : 4))
    m.participant.aggregate.mockImplementation(async (args: { _sum: Record<string, true> }) =>
      args._sum.numberOfParticipants ? { _sum: { numberOfParticipants: 40 } } : { _sum: { amountPaidPaise: 123450 } }
    )
    m.event.aggregate.mockResolvedValue({ _sum: { archivedParticipantCount: 100, archivedRevenuePaise: 500000 } })
    m.event.findMany.mockResolvedValue([
      {
        amount: 500,
        participants: [
          // Paid before charges were recorded: 2 seats × ₹500.
          { numberOfParticipants: 2, amountPaid: true, entryType: "PAID", paymentId: "pay_old", paymentOrderId: "order_old" },
          // Complimentary entries bring in nothing.
          { numberOfParticipants: 3, amountPaid: true, entryType: "COMPLIMENTARY", paymentId: null, paymentOrderId: null },
          // No entry type (older still) on a paid event counts as paid: 1 × ₹500.
          { numberOfParticipants: 1, amountPaid: true, entryType: null, paymentId: null, paymentOrderId: null },
        ],
      },
      { amount: 99.5, participants: [{ numberOfParticipants: 1, amountPaid: true, entryType: "PAID", paymentId: "p", paymentOrderId: "o" }] },
    ])
  }

  it("revenue is what Razorpay charged, plus pruned events' totals, plus the old estimate for older bookings", async () => {
    answerDashboard()
    const stats = await getDashboardStats()
    // 123450 charged + 500000 archived + 100000 + 50000 + 9950 estimated, in paise.
    expect(stats.totalRevenue).toBe(7834)
    expect(stats).toMatchObject({ totalEvents: 12, publishedEvents: 4, upcomingEvents: 3 })
  })

  it("participants are seats, including those of pruned events", async () => {
    answerDashboard()
    expect((await getDashboardStats()).totalParticipants).toBe(140)
    expect(m.participant.aggregate).toHaveBeenCalledWith({ _sum: { numberOfParticipants: true } })
  })

  it("asks for charges with an aggregate and estimates only bookings without one", async () => {
    answerDashboard()
    await getDashboardStats()
    expect(m.participant.aggregate).toHaveBeenCalledWith({ where: { amountPaid: true }, _sum: { amountPaidPaise: true } })
    expect(m.event.findMany.mock.calls[0][0].select.participants.where).toEqual({
      amountPaid: true,
      OR: [{ amountPaidPaise: { isSet: false } }, { amountPaidPaise: null }],
    })
  })

  it("is zero with no bookings at all", async () => {
    m.event.count.mockResolvedValue(0)
    m.participant.aggregate.mockResolvedValue({ _sum: { numberOfParticipants: null, amountPaidPaise: null } })
    m.event.aggregate.mockResolvedValue({ _sum: { archivedParticipantCount: null, archivedRevenuePaise: null } })
    m.event.findMany.mockResolvedValue([])
    expect(await getDashboardStats()).toMatchObject({ totalParticipants: 0, totalRevenue: 0 })
  })

  describe("Upcoming counts from the start of today in IST", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    function upcomingWhere() {
      const call = m.event.count.mock.calls.find(([args]) => (args as { where?: { date?: unknown } } | undefined)?.where?.date)
      return (call?.[0] as { where: Record<string, unknown> }).where
    }

    // Event dates are stored as UTC midnight of their day.
    it.each([
      ["01:30 IST on 5 Oct (still 4 Oct in UTC)", "2026-10-04T20:00:00.000Z", "2026-10-05T00:00:00.000Z"],
      ["14:00 IST on 5 Oct (the event's own day, after 05:30)", "2026-10-05T08:30:00.000Z", "2026-10-05T00:00:00.000Z"],
      ["23:59 IST on 5 Oct", "2026-10-05T18:29:00.000Z", "2026-10-05T00:00:00.000Z"],
    ])("at %s", async (_name, now, startOfToday) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(now))
      answerDashboard()
      await getDashboardStats()
      expect(upcomingWhere()).toEqual({
        status: { in: ["PUBLISHED", "BOOKING_CLOSED"] },
        date: { gte: new Date(startOfToday) },
      })
    })
  })
})

describe("which images events still use", () => {
  it("asks for events using any of the ids as banner or in the gallery", async () => {
    m.event.findMany.mockResolvedValue([])
    await findEventImagesAmong(["img/a", "img/b"])
    expect(m.event.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ bannerImageId: { in: ["img/a", "img/b"] } }, { galleryImages: { some: { id: { in: ["img/a", "img/b"] } } } }],
      },
      select: { bannerImageId: true, galleryImages: true },
    })
  })

  it("returns only the asked ids that are in use", async () => {
    m.event.findMany.mockResolvedValue([
      { bannerImageId: "img/a", galleryImages: [{ id: "img/other", url: "u1" }] },
      { bannerImageId: "img/banner", galleryImages: [{ id: "img/b", url: "u2" }] },
    ])
    expect((await findEventImagesAmong(["img/a", "img/b", "img/c"])).sort()).toEqual(["img/a", "img/b"])
  })

  it("asks nothing for no ids", async () => {
    expect(await findEventImagesAmong([])).toEqual([])
    expect(m.event.findMany).not.toHaveBeenCalled()
  })
})

describe("the settings row", () => {
  const PARTNER = { id: "bp1", name: "Partner", logoUrl: "https://res.cloudinary.com/x/logo.png", logoId: "ulsaham/brand-partners/logo" }
  const OTHER = { id: "bp2", name: "Other", logoUrl: "https://res.cloudinary.com/x/other.png", logoId: "ulsaham/brand-partners/other" }

  it("every read takes the oldest row, should there ever be two", async () => {
    m.settings.findFirst.mockResolvedValue({ id: "s1", brandPartners: [], pendingImageDeletes: [] })
    m.settings.update.mockResolvedValue({ id: "s1" })
    await getSettings()
    await upsertSettings({ phone: "9876543210" })
    await findTicketContactSettings()
    await findImageDeleteQueue()
    for (const [args] of m.settings.findFirst.mock.calls) expect(args).toMatchObject({ orderBy: { id: "asc" } })
    expect(m.settings.findFirst).toHaveBeenCalledTimes(4)
  })

  it("creates the row on first use", async () => {
    m.settings.findFirst.mockResolvedValue(null)
    m.settings.create.mockResolvedValue({ id: "s-new", brandPartners: [] })
    expect(await getSettings()).toEqual({ id: "s-new", brandPartners: [] })
    expect(m.settings.create).toHaveBeenCalledWith({ data: { companyName: "Ulsaham Entertainments" } })
  })

  it("adds a partner with one atomic push", async () => {
    m.settings.findFirst.mockResolvedValue({ id: "s1" })
    m.settings.update.mockResolvedValue({ id: "s1" })
    await addBrandPartner(PARTNER)
    expect(m.settings.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { brandPartners: { push: PARTNER } } })
  })

  it("removes a partner with one atomic deleteMany and returns it as stored", async () => {
    m.settings.findFirst.mockResolvedValue({ id: "s1", brandPartners: [OTHER, PARTNER] })
    m.settings.update.mockResolvedValue({ id: "s1" })
    expect(await removeBrandPartner("bp1")).toEqual(PARTNER)
    expect(m.settings.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { brandPartners: { deleteMany: { where: { id: "bp1" } } } },
    })
  })

  it("a partner already gone is null, with no write", async () => {
    m.settings.findFirst.mockResolvedValue({ id: "s1", brandPartners: [OTHER] })
    expect(await removeBrandPartner("bp1")).toBeNull()
    m.settings.findFirst.mockResolvedValue(null)
    expect(await removeBrandPartner("bp1")).toBeNull()
    expect(m.settings.update).not.toHaveBeenCalled()
  })

  it("queues images with one atomic push, creating the row if needed", async () => {
    const entries = [{ publicId: "img/a", deleteAfter: new Date("2026-10-04T12:00:00.000Z") }]
    m.settings.findFirst.mockResolvedValue(null)
    m.settings.create.mockResolvedValue({ id: "s-new" })
    m.settings.update.mockResolvedValue({ id: "s-new" })
    await queueImageDeletes(entries)
    expect(m.settings.update).toHaveBeenCalledWith({ where: { id: "s-new" }, data: { pendingImageDeletes: { push: entries } } })
  })

  it("reads the queue with the logos partners use", async () => {
    const pending = [{ publicId: "img/a", deleteAfter: new Date("2026-10-04T12:00:00.000Z") }]
    m.settings.findFirst.mockResolvedValue({ pendingImageDeletes: pending, brandPartners: [PARTNER] })
    expect(await findImageDeleteQueue()).toEqual({ pending, partnerLogoIds: ["ulsaham/brand-partners/logo"] })
    m.settings.findFirst.mockResolvedValue(null)
    expect(await findImageDeleteQueue()).toEqual({ pending: [], partnerLogoIds: [] })
  })

  it("takes off the queue only the entries that were due", async () => {
    const dueBy = new Date("2026-10-04T12:00:00.000Z")
    m.settings.findFirst.mockResolvedValue({ id: "s1" })
    m.settings.update.mockResolvedValue({ id: "s1" })
    await removeQueuedImageDeletes(["img/a", "img/b"], dueBy)
    expect(m.settings.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { pendingImageDeletes: { deleteMany: { where: { publicId: { in: ["img/a", "img/b"] }, deleteAfter: { lte: dueBy } } } } },
    })
  })
})

describe("the prune keeps each event's revenue", () => {
  it("writes the seat and revenue totals before deleting the bookings", async () => {
    m.event.findMany.mockResolvedValue([
      { id: "evtPaid", isFree: false, amount: 500 },
      { id: "evtFree", isFree: true, amount: null },
      // Already pruned: no bookings left, so nothing is written.
      { id: "evtDone", isFree: false, amount: 300 },
    ])
    m.participant.groupBy.mockImplementation(async (args: { _sum: Record<string, true> }) =>
      args._sum.numberOfParticipants
        ? [
            { eventId: "evtPaid", _sum: { numberOfParticipants: 7 } },
            { eventId: "evtFree", _sum: { numberOfParticipants: 3 } },
          ]
        : [
            { eventId: "evtPaid", _sum: { amountPaidPaise: 120000 } },
            { eventId: "evtFree", _sum: { amountPaidPaise: null } },
          ]
    )
    m.participant.findMany.mockResolvedValue([
      { eventId: "evtPaid", numberOfParticipants: 2, amountPaid: true, entryType: "PAID", paymentId: "pay_old", paymentOrderId: "order_old" },
      { eventId: "evtPaid", numberOfParticipants: 1, amountPaid: true, entryType: "COMPLIMENTARY", paymentId: null, paymentOrderId: null },
      { eventId: "evtFree", numberOfParticipants: 3, amountPaid: true, entryType: "FREE", paymentId: null, paymentOrderId: null },
    ])
    m.event.updateMany.mockResolvedValue({ count: 1 })
    m.participant.deleteMany.mockResolvedValue({ count: 1 })

    await pruneOldEventParticipants()

    const archive = (eventId: string, seats: number, paise: number) => ({
      where: { id: eventId, NOT: { archivedParticipantCount: { gt: 0 } } },
      data: { archivedParticipantCount: seats, archivedRevenuePaise: paise },
    })
    // ₹1,200 charged + 2 × ₹500 estimated for the older paid booking.
    expect(m.event.updateMany).toHaveBeenCalledWith(archive("evtPaid", 7, 220000))
    expect(m.event.updateMany).toHaveBeenCalledWith(archive("evtFree", 3, 0))
    expect(m.event.updateMany).toHaveBeenCalledTimes(2)
    expect(m.participant.deleteMany).toHaveBeenCalledWith({ where: { eventId: "evtPaid" } })
    expect(m.participant.deleteMany).toHaveBeenCalledWith({ where: { eventId: "evtFree" } })
    // Each event's totals are written before its bookings go.
    expect(m.event.updateMany.mock.invocationCallOrder[0]).toBeLessThan(m.participant.deleteMany.mock.invocationCallOrder[0])
    // The revenue reads cover only events that still hold bookings.
    expect(m.participant.findMany.mock.calls[0][0].where.eventId).toEqual({ in: ["evtPaid", "evtFree"] })
  })

  it("does nothing when no past event holds bookings", async () => {
    m.event.findMany.mockResolvedValue([{ id: "evtDone", isFree: false, amount: 300 }])
    m.participant.groupBy.mockResolvedValue([])
    await pruneOldEventParticipants()
    expect(m.event.updateMany).not.toHaveBeenCalled()
    expect(m.participant.deleteMany).not.toHaveBeenCalled()
  })
})

describe("what a paid booking records as charged", () => {
  const NOTES = { eventId: "evt1", name: "Test Buyer", phone: "9876543210", email: "", age: "30", numberOfParticipants: "2" }

  it.each<[string, unknown, number | null]>([
    ["a number of paise", 59000, 59000],
    ["a string of digits", "59000", 59000],
    ["no amount", undefined, null],
    ["zero", 0, null],
    ["a negative amount", -100, null],
    ["a fraction", 590.5, null],
    ["text", "59000 INR", null],
  ])("reads the order amount from %s", (_name, amount, expected) => {
    expect(bookingFromOrderNotes(NOTES, amount)?.amountPaise).toBe(expected)
    expect(bookingFromOrderNotes({ eventId: "evt1", ticketCode: "ue-testev-abc123" }, amount)).toEqual({
      kind: "repay",
      eventId: "evt1",
      ticketCode: "UE-TESTEV-ABC123",
      amountPaise: expected,
    })
  })

  it("fetchOrderBooking passes on the order's amount", async () => {
    m.ordersFetch.mockResolvedValue({ id: "order_1", amount: 118000, notes: NOTES })
    expect(await fetchOrderBooking("order_1")).toEqual({
      kind: "new",
      eventId: "evt1",
      name: "Test Buyer",
      phone: "9876543210",
      email: null,
      age: 30,
      numberOfParticipants: 2,
      amountPaise: 118000,
    })
    expect(m.ordersFetch).toHaveBeenCalledWith("order_1")
  })

  it("only a known amount is written to the booking", () => {
    expect(chargeFields({ amountPaise: 118000 })).toEqual({ amountPaidPaise: 118000 })
    expect(chargeFields({ amountPaise: null })).toEqual({})
  })
})
