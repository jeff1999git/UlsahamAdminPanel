// The rules under the booking and payment routes: the constant-time signature
// compare, the coupon rule apply-coupon and payment/order share, the guard
// against unique indexes the schema no longer declares, registerParticipant's
// idempotency keys, and the event edit that must never reset how often a
// complimentary code was used. Repositories and Prisma are replaced.
import { createHmac } from "node:crypto"
import { Prisma } from "@prisma/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { safeHexEqual } from "@/lib/razorpay"
import { validateCoupon } from "@/lib/coupon"
import { generateTicketCode } from "@/lib/ticket-code"
import { updateEventSchema } from "@/validators/event.validator"

const m = vi.hoisted(() => ({
  runCommandRaw: vi.fn(),
  // participant.repository
  findParticipantByEventAndOrderId: vi.fn(),
  findParticipantByTicketCodeOnly: vi.fn(),
  findParticipantByEventAndPhone: vi.fn(),
  createParticipant: vi.fn(),
  countParticipantsForEvent: vi.fn(async () => 0),
  // event.repository
  findEventById: vi.fn(),
  allocateCompetitionNumber: vi.fn(async () => 1001),
  updateEvent: vi.fn(async (_id: string, data: unknown) => data),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { $runCommandRaw: m.runCommandRaw } }))
vi.mock("@/repositories/participant.repository", () => ({
  findParticipantByEventAndOrderId: m.findParticipantByEventAndOrderId,
  findParticipantByTicketCodeOnly: m.findParticipantByTicketCodeOnly,
  findParticipantByEventAndPhone: m.findParticipantByEventAndPhone,
  createParticipant: m.createParticipant,
  countParticipantsForEvent: m.countParticipantsForEvent,
}))
vi.mock("@/repositories/event.repository", () => ({
  findEventById: m.findEventById,
  allocateCompetitionNumber: m.allocateCompetitionNumber,
  updateEvent: m.updateEvent,
}))

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  // Each test starts from these answers; nothing set by an earlier test carries over.
  for (const mock of Object.values(m)) mock.mockReset()
  m.findParticipantByEventAndOrderId.mockResolvedValue(null)
  m.findParticipantByTicketCodeOnly.mockResolvedValue(null)
  m.findParticipantByEventAndPhone.mockResolvedValue(null)
  m.countParticipantsForEvent.mockResolvedValue(0)
  m.allocateCompetitionNumber.mockResolvedValue(1001)
  m.updateEvent.mockImplementation(async (_id: string, data: unknown) => data)
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  consoleError.mockRestore()
})

describe("safeHexEqual", () => {
  const expected = createHmac("sha256", "secret").update("order_1|pay_1").digest("hex")

  it.each<[string, string, boolean]>([
    ["the correct signature", expected, true],
    ["the correct signature in upper case (the same bytes)", expected.toUpperCase(), true],
    ["a wrong signature of the same length", "0".repeat(64), false],
    ["a short signature", "ab", false],
    ["64 characters that are not hex", "z".repeat(64), false],
    ["an odd number of hex digits", expected.slice(1), false],
    ["an empty signature", "", false],
    ["hex with a trailing space", `${expected} `, false],
  ])("%s", (_name, given, result) => {
    expect(safeHexEqual(expected, given)).toBe(result)
  })

  it("never throws, whatever it is given", () => {
    expect(() => safeHexEqual(expected, undefined as unknown as string)).not.toThrow()
    expect(safeHexEqual(expected, null as unknown as string)).toBe(false)
  })
})

describe("validateCoupon (shared by apply-coupon and payment/order)", () => {
  const event = { couponCodes: [{ code: "SAVE100", discount: 100 }, { code: "ALLOFIT", discount: 500 }], effectiveAmount: 500 }

  it("accepts a listed coupon worth less than the per-person price, in any case", () => {
    expect(validateCoupon(event, "save100")).toEqual({ valid: true, code: "SAVE100", discount: 100 })
  })

  it("calls an unlisted code unknown", () => {
    expect(validateCoupon(event, "NOPE")).toEqual({ valid: false, reason: "UNKNOWN" })
  })

  it("refuses a coupon worth the whole per-person price or more", () => {
    expect(validateCoupon(event, "ALLOFIT")).toEqual({ valid: false, reason: "NOT_APPLICABLE" })
    expect(validateCoupon({ ...event, effectiveAmount: 99 }, "SAVE100")).toEqual({ valid: false, reason: "NOT_APPLICABLE" })
  })

  it("refuses every coupon on an event with no price", () => {
    expect(validateCoupon({ ...event, effectiveAmount: null }, "SAVE100")).toEqual({ valid: false, reason: "NOT_APPLICABLE" })
  })
})

describe("legacy unique index guard", () => {
  const INDEXES = {
    cursor: {
      firstBatch: [
        { v: 2, key: { _id: 1 }, name: "_id_" },
        { v: 2, key: { ticketCode: 1 }, name: "Participant_ticketCode_key", unique: true },
        { v: 2, key: { eventId: 1 }, name: "Participant_eventId_idx" },
        { v: 2, key: { eventId: 1, phone: 1 }, name: "Participant_eventId_phone_idx" },
      ],
    },
  }
  const LEGACY = {
    cursor: {
      firstBatch: [
        ...INDEXES.cursor.firstBatch,
        { v: 2, key: { eventId: 1, phone: 1 }, name: "Participant_eventId_phone_key", unique: true },
      ],
    },
  }

  it("finds only unique indexes other than _id and ticketCode", async () => {
    const { legacyUniqueIndexNames } = await import("@/lib/index-guard")
    expect(legacyUniqueIndexNames(INDEXES)).toEqual([])
    expect(legacyUniqueIndexNames(LEGACY)).toEqual(["Participant_eventId_phone_key"])
    // A unique ticketCode index that also covers another field is not the declared one.
    const widened = { cursor: { firstBatch: [{ key: { ticketCode: 1, eventId: 1 }, name: "x", unique: true }] } }
    expect(legacyUniqueIndexNames(widened)).toEqual(["x"])
  })

  it("asks the database once per ten minutes and shares the answer", async () => {
    const { createIndexGuard } = await import("@/lib/index-guard")
    let now = 0
    const lookup = vi.fn(async () => LEGACY)
    const check = createIndexGuard(lookup, () => now)

    expect(await Promise.all([check(), check()])).toEqual([["Participant_eventId_phone_key"], ["Participant_eventId_phone_key"]])
    now = 9 * 60_000
    await check()
    expect(lookup).toHaveBeenCalledTimes(1)
    now = 10 * 60_000 + 1
    await check()
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it("logs a failed check, treats it as no legacy index and retries after a minute", async () => {
    const { createIndexGuard } = await import("@/lib/index-guard")
    let now = 0
    const lookup = vi.fn(async (): Promise<unknown> => {
      throw new Error("not authorized to list indexes")
    })
    const check = createIndexGuard(lookup, () => now)

    expect(await check()).toEqual([])
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Could not list the Participant indexes"), expect.any(Error))
    now = 30_000
    await check()
    expect(lookup).toHaveBeenCalledTimes(1)
    now = 61_000
    lookup.mockResolvedValueOnce(LEGACY)
    expect(await check()).toEqual(["Participant_eventId_phone_key"])
  })

  it("an unreadable reply counts as a failed check", async () => {
    const { createIndexGuard } = await import("@/lib/index-guard")
    expect(await createIndexGuard(async () => ({ ok: 1 }))()).toEqual([])
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  it("a check that has not answered after 3 s counts as failed, so bookings never wait on it", async () => {
    vi.useFakeTimers()
    try {
      const { createIndexGuard } = await import("@/lib/index-guard")
      const check = createIndexGuard(() => new Promise(() => {}))
      let settled = false
      const pending = check().then((names) => {
        settled = true
        return names
      })
      await vi.advanceTimersByTimeAsync(2999)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await pending).toEqual([])
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Could not list the Participant indexes"), expect.any(Error))
    } finally {
      vi.useRealTimers()
    }
  })

  describe("against Prisma's listIndexes", () => {
    beforeEach(() => {
      // A fresh module, so its per-instance cache starts empty.
      vi.resetModules()
    })

    it("guard on: logs loudly on every booking request and blocks a phone that already has a booking", async () => {
      m.runCommandRaw.mockResolvedValue(LEGACY)
      const { legacyIndexBlocksPhone, warnIfLegacyUniqueIndexes } = await import("@/lib/index-guard")

      m.findParticipantByEventAndPhone.mockResolvedValueOnce({ id: "p1" })
      expect(await legacyIndexBlocksPhone("evt1", "9876543210")).toBe(true)
      m.findParticipantByEventAndPhone.mockResolvedValueOnce(null)
      expect(await legacyIndexBlocksPhone("evt1", "9876500000")).toBe(false)
      expect(await warnIfLegacyUniqueIndexes()).toBe(true)

      expect(m.runCommandRaw).toHaveBeenCalledTimes(1)
      expect(m.runCommandRaw).toHaveBeenCalledWith({ listIndexes: "Participant" })
      expect(consoleError).toHaveBeenCalledTimes(3)
      expect(String(consoleError.mock.calls[0][0])).toMatch(/LEGACY UNIQUE INDEX on Participant: Participant_eventId_phone_key/)
    })

    it("guard off: no log and no booking lookup", async () => {
      m.runCommandRaw.mockResolvedValue(INDEXES)
      const { legacyIndexBlocksPhone } = await import("@/lib/index-guard")
      expect(await legacyIndexBlocksPhone("evt1", "9876543210")).toBe(false)
      expect(m.findParticipantByEventAndPhone).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
    })

    it("listIndexes failing: guard off, the failure logged, booking goes ahead", async () => {
      m.runCommandRaw.mockRejectedValue(new Error("connection reset"))
      const { legacyIndexBlocksPhone } = await import("@/lib/index-guard")
      expect(await legacyIndexBlocksPhone("evt1", "9876543210")).toBe(false)
      expect(m.findParticipantByEventAndPhone).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledTimes(1)
      expect(String(consoleError.mock.calls[0][0])).toMatch(/Could not list the Participant indexes/)
    })
  })
})

describe("registerParticipant", () => {
  const event = {
    id: "evt1",
    slug: "test-event",
    status: "PUBLISHED" as const,
    capacity: 100,
    isCompetition: false,
    participationType: "INDIVIDUAL" as const,
  }
  const BUYER = { name: "Test Person", phone: "9876543210", email: null, age: 30, numberOfParticipants: 1 }

  function stored(data: Record<string, unknown>) {
    return { id: "p-new", eventId: "evt1", requestId: null, paymentOrderId: null, ...data }
  }

  function duplicateCode(target = "Participant_ticketCode_key") {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.22.0",
      meta: { target },
    })
  }

  let registerParticipant: typeof import("@/services/participant.service").registerParticipant
  let service: typeof import("@/services/participant.service")
  beforeEach(async () => {
    service = await import("@/services/participant.service")
    registerParticipant = service.registerParticipant
    m.findEventById.mockResolvedValue(event)
    m.createParticipant.mockImplementation(async (data: Record<string, unknown>) => stored(data))
  })

  it("returns the booking an order already made before looking at the event's status", async () => {
    const booked = stored({ id: "p1", paymentOrderId: "order_1", amountPaid: true })
    m.findParticipantByEventAndOrderId.mockResolvedValue(booked)
    m.findEventById.mockResolvedValue({ ...event, status: "BOOKING_CLOSED" })

    const result = await registerParticipant({ eventId: "evt1", ...BUYER, paymentOrderId: "order_1" })

    expect(result).toEqual({ participant: booked, isNew: false })
    expect(m.findEventById).not.toHaveBeenCalled()
    expect(m.createParticipant).not.toHaveBeenCalled()
  })

  it("still refuses a new booking once booking has closed", async () => {
    m.findParticipantByEventAndOrderId.mockResolvedValue(null)
    m.findEventById.mockResolvedValue({ ...event, status: "BOOKING_CLOSED" })
    await expect(registerParticipant({ eventId: "evt1", ...BUYER, paymentOrderId: "order_1" })).rejects.toThrow(
      service.EVENT_NOT_ACCEPTING
    )
  })

  it("uses an event it is given instead of reading it and counting seats again", async () => {
    await registerParticipant({ eventId: "evt1", ...BUYER, amountPaid: true, entryType: "FREE" }, { event })
    expect(m.findEventById).not.toHaveBeenCalled()
    expect(m.countParticipantsForEvent).not.toHaveBeenCalled()
    expect(m.createParticipant).toHaveBeenCalledTimes(1)
  })

  it("stores a request id and derives the ticket code from it", async () => {
    const first = await registerParticipant({ eventId: "evt1", ...BUYER, requestId: "req-0001-abcd" }, { event })
    const code = generateTicketCode("test-event", "request:evt1:req-0001-abcd")
    expect(first.isNew).toBe(true)
    expect(m.createParticipant).toHaveBeenCalledWith(expect.objectContaining({ requestId: "req-0001-abcd", ticketCode: code }))
  })

  it("leaves requestId out of a booking without one, and ignores it for a paid order", async () => {
    await registerParticipant({ eventId: "evt1", ...BUYER }, { event })
    expect(m.createParticipant.mock.calls[0][0]).not.toHaveProperty("requestId")

    m.findParticipantByEventAndOrderId.mockResolvedValue(null)
    await registerParticipant({ eventId: "evt1", ...BUYER, paymentOrderId: "order_9", requestId: "req-0001-abcd" }, { event })
    expect(m.createParticipant.mock.calls[1][0]).not.toHaveProperty("requestId")
    expect(m.createParticipant.mock.calls[1][0].ticketCode).toBe(generateTicketCode("test-event", "order_9"))
  })

  it("hands back the first booking when the same submit arrives twice at once", async () => {
    const first = stored({ id: "p1", requestId: "req-0001-abcd", phone: BUYER.phone })
    m.createParticipant.mockRejectedValueOnce(duplicateCode())
    m.findParticipantByTicketCodeOnly.mockResolvedValue(first)

    const result = await registerParticipant({ eventId: "evt1", ...BUYER, requestId: "req-0001-abcd" }, { event })

    expect(result).toEqual({ participant: first, isNew: false })
    expect(m.createParticipant).toHaveBeenCalledTimes(1)
  })

  it("never hands a booking to the same request id with another phone", async () => {
    m.createParticipant.mockRejectedValueOnce(duplicateCode())
    m.findParticipantByTicketCodeOnly.mockResolvedValue(stored({ id: "p1", requestId: "req-0001-abcd", phone: "9000000000" }))

    const result = await registerParticipant({ eventId: "evt1", ...BUYER, requestId: "req-0001-abcd" }, { event })

    expect(result.isNew).toBe(true)
    expect(m.createParticipant).toHaveBeenCalledTimes(2)
    expect(m.createParticipant.mock.calls[1][0].ticketCode).toBe(generateTicketCode("test-event", "request:evt1:req-0001-abcd#1"))
  })

  it("reports a legacy per-phone unique index as PHONE_ALREADY_REGISTERED", async () => {
    m.createParticipant.mockRejectedValueOnce(duplicateCode("Participant_eventId_phone_key"))
    await expect(registerParticipant({ eventId: "evt1", ...BUYER }, { event })).rejects.toThrow(service.PHONE_ALREADY_REGISTERED)
  })

  // payment/verify and the Razorpay webhook writing one order at once, while the
  // old (eventId, phone) unique index is still in the database: the second
  // write breaks both indexes, and MongoDB may name the phone one.
  it("hands back the order's booking when a legacy per-phone index reports the concurrent duplicate", async () => {
    const first = stored({ id: "p1", paymentOrderId: "order_1", phone: BUYER.phone, amountPaid: true })
    m.createParticipant.mockRejectedValueOnce(duplicateCode("Participant_eventId_phone_key"))
    m.findParticipantByTicketCodeOnly.mockResolvedValue(first)

    const result = await registerParticipant(
      { eventId: "evt1", ...BUYER, paymentOrderId: "order_1", amountPaid: true, entryType: "PAID" },
      { event }
    )

    expect(result).toEqual({ participant: first, isNew: false })
    expect(m.findParticipantByTicketCodeOnly).toHaveBeenCalledWith(generateTicketCode("test-event", "order_1"))
    expect(m.createParticipant).toHaveBeenCalledTimes(1)
  })

  it("still reports PHONE_ALREADY_REGISTERED when the phone's booking is another order's", async () => {
    m.createParticipant.mockRejectedValueOnce(duplicateCode("Participant_eventId_phone_key"))
    m.findParticipantByTicketCodeOnly.mockResolvedValue(null)
    await expect(
      registerParticipant({ eventId: "evt1", ...BUYER, paymentOrderId: "order_2", amountPaid: true }, { event })
    ).rejects.toThrow(service.PHONE_ALREADY_REGISTERED)

    // The seeded code held by a different order is not this booking either.
    m.createParticipant.mockRejectedValueOnce(duplicateCode("Participant_eventId_phone_key"))
    m.findParticipantByTicketCodeOnly.mockResolvedValue(stored({ id: "p9", paymentOrderId: "order_other", phone: BUYER.phone }))
    await expect(
      registerParticipant({ eventId: "evt1", ...BUYER, paymentOrderId: "order_2", amountPaid: true }, { event })
    ).rejects.toThrow(service.PHONE_ALREADY_REGISTERED)
  })
})

describe("saving the event form keeps complimentary-code usage", () => {
  const existing = {
    id: "evt1",
    status: "PUBLISHED",
    date: new Date("2099-01-01T00:00:00.000Z"),
    startTime: "06:00 PM",
    endTime: "09:00 PM",
    bannerImageId: "ulsaham/events/banner",
    galleryImages: [],
    complimentaryCodes: [
      { code: "VIP", maxUses: 5, usedCount: 3 },
      { code: "press", maxUses: 2, usedCount: 2 },
    ],
  }

  it("the update schema drops a usedCount sent by the form", () => {
    const parsed = updateEventSchema.parse({ id: "evt1", complimentaryCodes: [{ code: "vip", maxUses: 5, usedCount: 0 }] })
    expect(parsed.complimentaryCodes).toEqual([{ code: "VIP", maxUses: 5 }])
  })

  it("keeps each code's count from the database and starts a new code at 0", async () => {
    m.findEventById.mockResolvedValue(existing)
    const { updateExistingEvent } = await import("@/services/event.service")

    await updateExistingEvent("evt1", {
      complimentaryCodes: [
        { code: "VIP", maxUses: 10 },
        { code: "PRESS", maxUses: 4 },
        { code: "NEWCODE", maxUses: 1 },
      ],
    })

    expect(m.updateEvent).toHaveBeenCalledWith("evt1", {
      complimentaryCodes: {
        set: [
          { code: "VIP", maxUses: 10, usedCount: 3 },
          { code: "PRESS", maxUses: 4, usedCount: 2 },
          { code: "NEWCODE", maxUses: 1, usedCount: 0 },
        ],
      },
    })
  })
})
