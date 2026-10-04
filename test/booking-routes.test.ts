// The public booking routes the site calls before any money moves:
// payment/order, register, apply-coupon and participants/check. Each answers
// with the shape the site reads, including the machine-readable `code` on the
// errors the site acts on. The event, the repositories, Razorpay and the
// legacy-index guard are replaced; validation, pricing and the coupon rule
// stay real.
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  paymentOrderRateLimit,
  paymentOrderIpRateLimit,
  registerRateLimit,
  registerIpRateLimit,
  getClientIP,
} from "@/lib/ratelimit"
import { getEffectiveAmount } from "@/lib/pricing"
import { getBookingClosedMessage, getBookingClosedReason } from "@/lib/event-status"

const m = vi.hoisted(() => ({
  getBookableEventBySlug: vi.fn(),
  incrementComplimentaryCodeUsage: vi.fn(async () => undefined),
  countParticipantsForEvent: vi.fn(async () => 0),
  findParticipantByTicketCodeOnly: vi.fn(),
  findParticipantByEventAndRequestId: vi.fn(),
  registerParticipant: vi.fn(),
  checkTicketCode: vi.fn(),
  legacyIndexBlocksPhone: vi.fn(async () => false),
  warnIfLegacyUniqueIndexes: vi.fn(async () => false),
  ordersCreate: vi.fn(async (order: { amount: number }) => ({ id: "order_test", ...order })),
}))

vi.mock("@/services/event.service", () => ({
  getBookableEventBySlug: m.getBookableEventBySlug,
  incrementComplimentaryCodeUsage: m.incrementComplimentaryCodeUsage,
}))
vi.mock("@/repositories/participant.repository", () => ({
  countParticipantsForEvent: m.countParticipantsForEvent,
  findParticipantByTicketCodeOnly: m.findParticipantByTicketCodeOnly,
  findParticipantByEventAndRequestId: m.findParticipantByEventAndRequestId,
}))
vi.mock("@/services/participant.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/participant.service")>()),
  registerParticipant: m.registerParticipant,
  checkTicketCode: m.checkTicketCode,
}))
vi.mock("@/lib/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/razorpay")>()),
  getRazorpay: () => ({ orders: { create: m.ordersCreate } }),
}))
vi.mock("@/lib/index-guard", () => ({
  legacyIndexBlocksPhone: m.legacyIndexBlocksPhone,
  warnIfLegacyUniqueIndexes: m.warnIfLegacyUniqueIndexes,
}))

import { POST as order } from "@/app/api/public/events/[slug]/payment/order/route"
import { POST as register } from "@/app/api/public/events/[slug]/register/route"
import { POST as applyCoupon } from "@/app/api/public/events/[slug]/apply-coupon/route"
import { GET as checkTicket } from "@/app/api/public/participants/check/route"

const BUYER = { name: "Test Buyer", phone: "9876543210", email: "buyer@example.test", age: 30, numberOfParticipants: 1 }
const params = { params: Promise.resolve({ slug: "test-event" }) }

/** What getBookableEventBySlug returns: the selected row plus price and closed reason. */
function bookable(overrides: Record<string, unknown> = {}) {
  const row = {
    id: "evt1",
    name: "Test Event",
    slug: "test-event",
    status: "PUBLISHED" as const,
    date: new Date("2099-01-01T00:00:00.000Z"),
    startTime: "06:00 PM",
    endTime: "09:00 PM",
    venue: "Main Hall",
    capacity: null as number | null,
    isFree: false,
    amount: 500,
    earlyBirdAmount: null,
    isEarlyBird: false,
    gstEnabled: false,
    platformFeeEnabled: false,
    isCompetition: false,
    participationType: "INDIVIDUAL" as const,
    groupExtraAmount: null,
    couponCodes: [{ code: "SAVE100", discount: 100 }, { code: "TOOBIG", discount: 500 }, { code: "ALMOST", discount: 499.5 }],
    complimentaryCodes: [{ code: "VIPFREE", maxUses: 5, usedCount: 1 }, { code: "USEDUP", maxUses: 2, usedCount: 2 }],
    ...overrides,
  }
  const reason = getBookingClosedReason(row)
  return { ...row, effectiveAmount: getEffectiveAmount(row), bookingClosedReason: reason, bookingClosedMessage: getBookingClosedMessage(reason) }
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/public/events/test-event/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function participantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    eventId: "evt1",
    name: "Test Buyer",
    phone: "9876543210",
    email: "buyer@example.test",
    age: 30,
    numberOfParticipants: 1,
    ticketCode: "UE-TESTEV-ABC123",
    competitionNumber: null,
    isGroupRegistration: false,
    amountPaid: true,
    paymentId: null,
    paymentOrderId: null,
    requestId: null,
    ...overrides,
  }
}

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  // Each test starts from these answers; nothing set by an earlier test carries over.
  for (const mock of Object.values(m)) mock.mockReset()
  m.getBookableEventBySlug.mockResolvedValue(bookable())
  m.incrementComplimentaryCodeUsage.mockResolvedValue(undefined)
  m.countParticipantsForEvent.mockResolvedValue(0)
  m.findParticipantByTicketCodeOnly.mockResolvedValue(null)
  m.findParticipantByEventAndRequestId.mockResolvedValue(null)
  m.legacyIndexBlocksPhone.mockResolvedValue(false)
  m.warnIfLegacyUniqueIndexes.mockResolvedValue(false)
  m.ordersCreate.mockImplementation(async (o: { amount: number }) => ({ id: "order_test", ...o }))
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  consoleError.mockRestore()
  vi.useRealTimers()
})

describe("rate limits run after validation, per visitor and phone plus a per-IP ceiling", () => {
  it("payment/order: a malformed body costs nothing", async () => {
    const response = await order(post("payment/order", { ...BUYER, phone: "123" }), params)
    expect(response.status).toBe(400)
    expect(paymentOrderRateLimit.limit).not.toHaveBeenCalled()
    expect(paymentOrderIpRateLimit.limit).not.toHaveBeenCalled()
  })

  it("payment/order: keyed ip:phone and ip", async () => {
    await order(post("payment/order", BUYER), params)
    expect(paymentOrderRateLimit.limit).toHaveBeenCalledWith("203.0.113.9:9876543210")
    expect(paymentOrderIpRateLimit.limit).toHaveBeenCalledWith("203.0.113.9")
  })

  it("payment/order: either bucket being full answers 429 in the usual shape", async () => {
    vi.mocked(paymentOrderIpRateLimit.limit).mockResolvedValueOnce({ success: false, limit: 60, remaining: 0, reset: 0, pending: Promise.resolve() })
    const response = await order(post("payment/order", BUYER), params)
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ success: false, error: "Too many requests. Please try again later." })
    expect(m.getBookableEventBySlug).not.toHaveBeenCalled()
  })

  it("register: keyed ip:phone and ip, after validation", async () => {
    await register(post("register", { ...BUYER, age: 0 }), params)
    expect(registerRateLimit.limit).not.toHaveBeenCalled()

    m.getBookableEventBySlug.mockResolvedValue(bookable({ isFree: true, amount: null }))
    m.registerParticipant.mockResolvedValue({ participant: participantRow(), isNew: true })
    await register(post("register", BUYER), params)
    expect(registerRateLimit.limit).toHaveBeenCalledWith("203.0.113.9:9876543210")
    expect(registerIpRateLimit.limit).toHaveBeenCalledWith("203.0.113.9")
  })

  it("a relayed visitor IP without the proxy key is logged once per instance", () => {
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("ulsaham.ratelimit.untrustedRelayLogged")]
    const relayed = () =>
      new Request("http://localhost/x", { headers: { "x-forwarded-for": "10.0.0.1", "x-client-ip": "203.0.113.7", "x-proxy-key": "wrong" } })
    expect(getClientIP(relayed())).toBe("10.0.0.1")
    expect(getClientIP(relayed())).toBe("10.0.0.1")
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(String(consoleError.mock.calls[0][0])).toMatch(/x-client-ip.*without a valid x-proxy-key/)

    // The site's own proxy, with the key, is trusted and not logged.
    const trusted = new Request("http://localhost/x", { headers: { "x-client-ip": "203.0.113.7", "x-proxy-key": "test-proxy-secret" } })
    expect(getClientIP(trusted)).toBe("203.0.113.7")
    expect(consoleError).toHaveBeenCalledTimes(1)
  })
})

describe("POST payment/order", () => {
  it("charges a valid coupon", async () => {
    const response = await order(post("payment/order", { ...BUYER, couponCode: "save100" }), params)
    expect(response.status).toBe(200)
    expect(m.ordersCreate.mock.calls[0][0]).toMatchObject({ amount: 40000, notes: { couponCode: "SAVE100", couponDiscount: "100" } })
  })

  it.each([
    ["an unknown coupon", "NOPE"],
    ["a coupon worth the whole price (apply-coupon refuses it too)", "TOOBIG"],
  ])("answers 404 COUPON_INVALID for %s, before any order", async (_name, couponCode) => {
    const response = await order(post("payment/order", { ...BUYER, couponCode }), params)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ success: false, error: "Invalid coupon code", code: "COUPON_INVALID" })
    expect(m.ordersCreate).not.toHaveBeenCalled()
  })

  it("answers 400 AMOUNT_TOO_LOW for a total under ₹1, before any order", async () => {
    const response = await order(post("payment/order", { ...BUYER, couponCode: "ALMOST" }), params)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ success: false, error: "The total must be at least ₹1.", code: "AMOUNT_TOO_LOW" })
    expect(m.ordersCreate).not.toHaveBeenCalled()
  })

  it("answers 502 GATEWAY_UNAVAILABLE when Razorpay refuses the order", async () => {
    m.ordersCreate.mockRejectedValueOnce(new Error("Razorpay 500"))
    const response = await order(post("payment/order", BUYER), params)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      success: false,
      error: "The payment gateway is busy. Please try again.",
      code: "GATEWAY_UNAVAILABLE",
    })
  })

  it("answers 502 GATEWAY_UNAVAILABLE when Razorpay does not answer within 8 s", async () => {
    vi.useFakeTimers()
    m.ordersCreate.mockImplementationOnce(() => new Promise(() => {}))
    const pending = order(post("payment/order", BUYER), params)
    await vi.advanceTimersByTimeAsync(8000)
    const response = await pending
    expect(response.status).toBe(502)
    expect((await response.json()).code).toBe("GATEWAY_UNAVAILABLE")
  })

  it("refuses with 409 PHONE_ALREADY_REGISTERED, before any order, while a legacy unique index blocks this phone", async () => {
    m.legacyIndexBlocksPhone.mockResolvedValueOnce(true)
    const response = await order(post("payment/order", BUYER), params)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      error: "This phone number already has a booking for this event.",
      code: "PHONE_ALREADY_REGISTERED",
    })
    expect(m.legacyIndexBlocksPhone).toHaveBeenCalledWith("evt1", "9876543210")
    expect(m.ordersCreate).not.toHaveBeenCalled()
  })

  it("a re-payment of an unpaid ticket creates no booking, so the guard is not asked", async () => {
    m.findParticipantByTicketCodeOnly.mockResolvedValue(participantRow({ amountPaid: false, numberOfParticipants: 2 }))
    const response = await order(post("payment/order", { ...BUYER, ticketCode: "ue-testev-abc123" }), params)
    expect(response.status).toBe(200)
    expect(m.legacyIndexBlocksPhone).not.toHaveBeenCalled()
    expect(m.ordersCreate.mock.calls[0][0]).toMatchObject({ amount: 100000, notes: { ticketCode: "UE-TESTEV-ABC123" } })
  })

  it("answers 404 EVENT_NOT_FOUND for an unknown event", async () => {
    m.getBookableEventBySlug.mockResolvedValue(null)
    const response = await order(post("payment/order", BUYER), params)
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe("EVENT_NOT_FOUND")
  })

  it("refuses a cancelled event with 410 and its message", async () => {
    m.getBookableEventBySlug.mockResolvedValue(bookable({ status: "CANCELLED" }))
    const response = await order(post("payment/order", BUYER), params)
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ success: false, error: "This event has been cancelled." })
  })

  it("counts seats once, only for a new booking with a capacity", async () => {
    m.getBookableEventBySlug.mockResolvedValue(bookable({ capacity: 10 }))
    m.countParticipantsForEvent.mockResolvedValueOnce(10)
    const response = await order(post("payment/order", BUYER), params)
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ success: false, error: "Event is full" })
    expect(m.countParticipantsForEvent).toHaveBeenCalledTimes(1)
  })
})

describe("POST register", () => {
  const FREE = { isFree: true, amount: null }

  it("creates a booking with the request id and the event it already read (201)", async () => {
    m.getBookableEventBySlug.mockResolvedValue(bookable(FREE))
    m.findParticipantByEventAndRequestId.mockResolvedValue(null)
    m.registerParticipant.mockResolvedValue({ participant: participantRow(), isNew: true })

    const response = await register(post("register", { ...BUYER, requestId: "0b9f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b" }), params)

    expect(response.status).toBe(201)
    expect(m.registerParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt1", requestId: "0b9f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b", entryType: "FREE" }),
      { event: expect.objectContaining({ id: "evt1" }) }
    )
    expect((await response.json()).data).toMatchObject({ ticketCode: "UE-TESTEV-ABC123", eventName: "Test Event", isFree: true })
  })

  it("a repeated request id returns the first booking (200), even after booking closed", async () => {
    m.getBookableEventBySlug.mockResolvedValue(bookable({ ...FREE, status: "BOOKING_CLOSED" }))
    m.findParticipantByEventAndRequestId.mockResolvedValue(participantRow({ requestId: "req-0001-abcd" }))

    const response = await register(post("register", { ...BUYER, requestId: "req-0001-abcd" }), params)

    expect(response.status).toBe(200)
    expect((await response.json()).data.ticketCode).toBe("UE-TESTEV-ABC123")
    expect(m.findParticipantByEventAndRequestId).toHaveBeenCalledWith("evt1", "req-0001-abcd", "9876543210")
    expect(m.registerParticipant).not.toHaveBeenCalled()
    expect(m.incrementComplimentaryCodeUsage).not.toHaveBeenCalled()
  })

  it("rejects a malformed request id", async () => {
    const response = await register(post("register", { ...BUYER, requestId: "bad id!" }), params)
    expect(response.status).toBe(400)
    expect((await response.json()).fieldErrors.requestId).toBeDefined()
  })

  it("counts a complimentary code once per new booking, not on a concurrent duplicate", async () => {
    m.registerParticipant.mockResolvedValueOnce({ participant: participantRow(), isNew: true })
    expect((await register(post("register", { ...BUYER, code: "vipfree" }), params)).status).toBe(201)
    expect(m.incrementComplimentaryCodeUsage).toHaveBeenCalledWith("evt1", "VIPFREE")

    m.registerParticipant.mockResolvedValueOnce({ participant: participantRow(), isNew: false })
    expect((await register(post("register", { ...BUYER, code: "vipfree", requestId: "req-0001-abcd" }), params)).status).toBe(200)
    expect(m.incrementComplimentaryCodeUsage).toHaveBeenCalledTimes(1)
  })

  it.each(["NOPE", "USEDUP"])("answers 400 COUPON_INVALID for the code %s", async (code) => {
    const response = await register(post("register", { ...BUYER, code }), params)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ success: false, error: "Invalid or fully-used code", code: "COUPON_INVALID" })
  })

  it("refuses a cancelled event with 410", async () => {
    m.getBookableEventBySlug.mockResolvedValue(bookable({ ...FREE, status: "CANCELLED" }))
    const response = await register(post("register", BUYER), params)
    expect(response.status).toBe(410)
    expect((await response.json()).error).toBe("This event has been cancelled.")
  })

  it("logs through the legacy-index guard before writing", async () => {
    m.getBookableEventBySlug.mockResolvedValue(bookable(FREE))
    m.registerParticipant.mockResolvedValue({ participant: participantRow(), isNew: true })
    await register(post("register", BUYER), params)
    expect(m.warnIfLegacyUniqueIndexes).toHaveBeenCalledTimes(1)
  })
})

describe("POST apply-coupon", () => {
  const check = (couponCode: string) => applyCoupon(post("apply-coupon", { couponCode }), params)

  it("accepts a valid coupon and a complimentary code with entries left", async () => {
    expect(await (await check("save100")).json()).toEqual({ success: true, data: { type: "coupon", couponCode: "SAVE100", discount: 100 } })
    expect(await (await check("vipfree")).json()).toEqual({
      success: true,
      data: { type: "complimentary", couponCode: "VIPFREE", remainingUses: 4 },
    })
  })

  it.each<[string, string, number, string]>([
    ["an unknown code", "NOPE", 404, "Invalid coupon code"],
    ["a coupon worth the whole price", "TOOBIG", 400, "This coupon code is not valid for this event"],
    ["a used-up complimentary code", "USEDUP", 400, "This code has no remaining entries."],
  ])("rejects %s with COUPON_INVALID and today's status", async (_name, code, status, error) => {
    const response = await check(code)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ success: false, error, code: "COUPON_INVALID" })
  })

  it.each([
    ["closed", { status: "BOOKING_CLOSED" }, "Booking is closed for this event."],
    ["cancelled", { status: "CANCELLED" }, "This event has been cancelled."],
    ["ended", { date: new Date("2020-01-01T00:00:00.000Z") }, "Booking is closed — this event has ended."],
  ])("refuses a %s event with 410", async (_name, overrides, error) => {
    m.getBookableEventBySlug.mockResolvedValue(bookable(overrides))
    const response = await check("SAVE100")
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ success: false, error })
  })
})

describe("GET participants/check", () => {
  it("tells the site whether the booking is paid and its recorded Payment ID", async () => {
    m.checkTicketCode.mockResolvedValue({
      ...participantRow({ amountPaid: false, paymentId: null }),
      attended: false,
      registeredAt: new Date("2026-10-01T00:00:00.000Z"),
      event: { id: "evt1", name: "Test Event", slug: "test-event", date: new Date("2099-01-01T00:00:00.000Z"), venue: "Main Hall" },
    })
    let response = await checkTicket(new NextRequest("http://localhost/api/public/participants/check?ticketCode=ue-testev-abc123"))
    expect((await response.json()).data).toMatchObject({ amountPaid: false, paymentId: null })

    m.checkTicketCode.mockResolvedValue({
      ...participantRow({ amountPaid: true, paymentId: "pay_123" }),
      attended: false,
      registeredAt: new Date("2026-10-01T00:00:00.000Z"),
      event: { id: "evt1", name: "Test Event", slug: "test-event", date: new Date("2099-01-01T00:00:00.000Z"), venue: "Main Hall" },
    })
    response = await checkTicket(new NextRequest("http://localhost/api/public/participants/check?ticketCode=UE-TESTEV-ABC123"))
    const data = (await response.json()).data
    expect(data).toMatchObject({ amountPaid: true, paymentId: "pay_123" })
    // Still no phone, email or order id.
    expect(data).not.toHaveProperty("phone")
    expect(data).not.toHaveProperty("email")
    expect(data).not.toHaveProperty("paymentOrderId")
  })
})
