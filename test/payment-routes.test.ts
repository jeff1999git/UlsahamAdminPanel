// What happens after the money moves: payment/verify, the payment/status
// check the site uses when a verify reply was lost, the Razorpay webhook, and
// the signed request that asks the site to email a ticket the webhook
// completed. Repositories, the event read, Razorpay and after() are replaced;
// signatures, validation and the response shapes stay real.
import { createHmac } from "node:crypto"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { verifyRateLimit, paymentStatusRateLimit } from "@/lib/ratelimit"
import { getEffectiveAmount } from "@/lib/pricing"
import { getBookingClosedMessage, getBookingClosedReason } from "@/lib/event-status"

const m = vi.hoisted(() => ({
  afterTasks: [] as Array<() => unknown>,
  // participant.repository
  findBookingByOrderId: vi.fn(),
  findParticipantByOrderId: vi.fn(),
  findPaymentStateByOrderId: vi.fn(),
  findParticipantByEventAndOrderId: vi.fn(),
  findParticipantByTicketCodeOnly: vi.fn(),
  updateParticipant: vi.fn(),
  // events
  getBookableEventBySlug: vi.fn(),
  findTicketEventBySlug: vi.fn(),
  // services and side effects
  registerParticipant: vi.fn(),
  fetchOrderBooking: vi.fn(),
  logActivity: vi.fn(async () => undefined),
  requestTicketMail: vi.fn(async () => undefined),
}))

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    m.afterTasks.push(task)
  },
}))
vi.mock("@/repositories/participant.repository", () => ({
  findBookingByOrderId: m.findBookingByOrderId,
  findParticipantByOrderId: m.findParticipantByOrderId,
  findPaymentStateByOrderId: m.findPaymentStateByOrderId,
  findParticipantByEventAndOrderId: m.findParticipantByEventAndOrderId,
  findParticipantByTicketCodeOnly: m.findParticipantByTicketCodeOnly,
  updateParticipant: m.updateParticipant,
}))
vi.mock("@/repositories/event.repository", () => ({ findTicketEventBySlug: m.findTicketEventBySlug }))
vi.mock("@/services/event.service", () => ({ getBookableEventBySlug: m.getBookableEventBySlug }))
vi.mock("@/services/participant.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/participant.service")>()),
  registerParticipant: m.registerParticipant,
}))
vi.mock("@/lib/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/razorpay")>()),
  getRazorpay: () => {
    throw new Error("Razorpay is never called directly in these tests")
  },
  fetchOrderBooking: m.fetchOrderBooking,
}))
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.logActivity }))
vi.mock("@/lib/site-ticket-mail", () => ({ requestTicketMail: m.requestTicketMail }))

import { POST as verify } from "@/app/api/public/events/[slug]/payment/verify/route"
import { POST as paymentStatus } from "@/app/api/public/events/[slug]/payment/status/route"
import { POST as webhook, maxDuration } from "@/app/api/razorpay/webhook/route"
import { EVENT_NOT_ACCEPTING, PHONE_ALREADY_REGISTERED } from "@/services/participant.service"

const TICKET_PAYLOAD_KEYS = [
  "ticketCode",
  "participantName",
  "eventName",
  "eventDate",
  "eventVenue",
  "numberOfParticipants",
  "isCompetition",
  "competitionNumber",
  "isGroupRegistration",
  "paymentId",
  "orderId",
].sort()

const BUYER = { name: "Test Buyer", phone: "9876543210", email: "buyer@example.test", age: 30, numberOfParticipants: 2 }
const params = { params: Promise.resolve({ slug: "test-event" }) }

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
    capacity: null,
    isFree: false,
    amount: 500,
    earlyBirdAmount: null,
    isEarlyBird: false,
    gstEnabled: false,
    platformFeeEnabled: false,
    isCompetition: false,
    participationType: "INDIVIDUAL" as const,
    groupExtraAmount: null,
    couponCodes: [],
    complimentaryCodes: [],
    ...overrides,
  }
  const reason = getBookingClosedReason(row)
  return { ...row, effectiveAmount: getEffectiveAmount(row), bookingClosedReason: reason, bookingClosedMessage: getBookingClosedMessage(reason) }
}

function participantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    eventId: "evt1",
    name: "Test Buyer",
    phone: "9876543210",
    email: "buyer@example.test",
    age: 30,
    numberOfParticipants: 2,
    ticketCode: "UE-TESTEV-ABC123",
    competitionNumber: null,
    isGroupRegistration: false,
    amountPaid: true,
    paymentId: "pay_1",
    paymentOrderId: "order_1",
    requestId: null,
    ...overrides,
  }
}

const NEW_BOOKING = {
  kind: "new" as const,
  eventId: "evt1",
  name: "Test Buyer",
  phone: "9876543210",
  email: "buyer@example.test",
  age: 30,
  numberOfParticipants: 2,
}

function signedPayment(orderId = "order_1", paymentId = "pay_1") {
  const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex")
  return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }
}

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost/api/public/events/test-event/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  })
}

const limitResult = (success: boolean) => ({ success, limit: 0, remaining: 0, reset: 0, pending: Promise.resolve() })

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  // Each test starts from these answers; nothing set by an earlier test carries over.
  for (const mock of Object.values(m)) if (typeof mock === "function") mock.mockReset()
  m.afterTasks.length = 0
  m.findBookingByOrderId.mockResolvedValue(null)
  m.findParticipantByOrderId.mockResolvedValue(null)
  m.findPaymentStateByOrderId.mockResolvedValue(null)
  m.findParticipantByEventAndOrderId.mockResolvedValue(null)
  m.findParticipantByTicketCodeOnly.mockResolvedValue(null)
  m.updateParticipant.mockImplementation(async (id: string, data: Record<string, unknown>) => participantRow({ id, ...data }))
  m.getBookableEventBySlug.mockResolvedValue(bookable())
  m.findTicketEventBySlug.mockResolvedValue({ id: "evt1", name: "Test Event", date: new Date("2099-01-01T00:00:00.000Z"), venue: "Main Hall", isCompetition: false })
  m.fetchOrderBooking.mockResolvedValue(NEW_BOOKING)
  m.registerParticipant.mockResolvedValue({ participant: participantRow(), isNew: true })
  m.logActivity.mockResolvedValue(undefined)
  m.requestTicketMail.mockResolvedValue(undefined)
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  consoleError.mockRestore()
})

describe("POST payment/verify", () => {
  const verifyWith = (body: unknown) => verify(post("payment/verify", body), params)

  it.each([
    ["a wrong signature of the right length", "0".repeat(64)],
    ["a short signature", "ab"],
    ["a signature that is not hex", "z".repeat(64)],
  ])("refuses %s with 400 SIGNATURE_INVALID before any lookup", async (_name, razorpay_signature) => {
    const response = await verifyWith({ ...BUYER, ...signedPayment(), razorpay_signature })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe("SIGNATURE_INVALID")
    expect(m.findBookingByOrderId).not.toHaveBeenCalled()
    expect(m.fetchOrderBooking).not.toHaveBeenCalled()
  })

  it("answers an order that already has its booking from the database alone (200)", async () => {
    m.findBookingByOrderId.mockResolvedValue({
      ...participantRow(),
      event: { slug: "test-event", name: "Test Event", date: new Date("2099-01-01T00:00:00.000Z"), venue: "Main Hall", isCompetition: false },
    })

    const response = await verifyWith({ ...BUYER, ...signedPayment() })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body.data).sort()).toEqual(TICKET_PAYLOAD_KEYS)
    expect(body.data).toMatchObject({ ticketCode: "UE-TESTEV-ABC123", paymentId: "pay_1", orderId: "order_1" })
    expect(m.findBookingByOrderId).toHaveBeenCalledWith("order_1")
    // No Razorpay call and no event read: the event's status now cannot matter.
    expect(m.fetchOrderBooking).not.toHaveBeenCalled()
    expect(m.getBookableEventBySlug).not.toHaveBeenCalled()
    expect(m.registerParticipant).not.toHaveBeenCalled()
  })

  it("settles a recorded booking that was never marked paid", async () => {
    m.findBookingByOrderId.mockResolvedValue({
      ...participantRow({ amountPaid: false, paymentId: null }),
      event: { slug: "test-event", name: "Test Event", date: new Date("2099-01-01T00:00:00.000Z"), venue: "Main Hall", isCompetition: false },
    })
    const response = await verifyWith({ ...BUYER, ...signedPayment() })
    expect(response.status).toBe(200)
    expect(m.updateParticipant).toHaveBeenCalledWith("p1", { amountPaid: true, entryType: "PAID", paymentId: "pay_1" })
  })

  it("a booking recorded on another event does not answer for this one", async () => {
    m.findBookingByOrderId.mockResolvedValue({
      ...participantRow(),
      event: { slug: "other-event", name: "Other", date: new Date(), venue: "X", isCompetition: false },
    })
    m.fetchOrderBooking.mockResolvedValue({ ...NEW_BOOKING, eventId: "evt-other" })
    const response = await verifyWith({ ...BUYER, ...signedPayment() })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe("ORDER_MISMATCH")
  })

  it("starts the Razorpay fetch and the event read together", async () => {
    let releaseOrder: (value: unknown) => void = () => {}
    m.fetchOrderBooking.mockReturnValue(new Promise((resolve) => (releaseOrder = resolve)))
    const pending = verifyWith({ ...BUYER, ...signedPayment() })
    await vi.waitFor(() => expect(m.getBookableEventBySlug).toHaveBeenCalledWith("test-event"))
    releaseOrder(NEW_BOOKING)
    expect((await pending).status).toBe(201)
  })

  it("creates the booking from the order's notes with the event it read (201)", async () => {
    const response = await verifyWith({ ...BUYER, numberOfParticipants: 9, ...signedPayment() })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(Object.keys(body.data).sort()).toEqual(TICKET_PAYLOAD_KEYS)
    expect(m.fetchOrderBooking).toHaveBeenCalledWith("order_1")
    expect(m.registerParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt1", numberOfParticipants: 2, paymentOrderId: "order_1", paymentId: "pay_1" }),
      { event: expect.objectContaining({ id: "evt1" }) }
    )
  })

  it("answers 200 when registerParticipant finds the order's booking (a race with the webhook)", async () => {
    m.registerParticipant.mockResolvedValue({ participant: participantRow(), isNew: false })
    expect((await verifyWith({ ...BUYER, ...signedPayment() })).status).toBe(200)
  })

  it("answers 502 GATEWAY_UNAVAILABLE when Razorpay cannot be reached, even if the event read failed too", async () => {
    m.fetchOrderBooking.mockRejectedValue(new Error("Timed out fetching the Razorpay order"))
    m.getBookableEventBySlug.mockRejectedValue(new Error("db down"))
    const response = await verifyWith({ ...BUYER, ...signedPayment() })
    expect(response.status).toBe(502)
    expect((await response.json()).code).toBe("GATEWAY_UNAVAILABLE")
  })

  it("answers 404 EVENT_NOT_FOUND for an unknown event and for a cancelled one", async () => {
    m.getBookableEventBySlug.mockResolvedValue(null)
    let response = await verifyWith({ ...BUYER, ...signedPayment() })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      success: false,
      error: "Event not found. Please contact support with your payment ID.",
      code: "EVENT_NOT_FOUND",
    })

    m.getBookableEventBySlug.mockResolvedValue(bookable({ status: "CANCELLED" }))
    response = await verifyWith({ ...BUYER, ...signedPayment() })
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.code).toBe("EVENT_NOT_FOUND")
    expect(body.error).toMatch(/cancelled.*payment ID/)
    expect(m.registerParticipant).not.toHaveBeenCalled()
  })

  it.each([
    ["an order for another event", { ...NEW_BOOKING, eventId: "evt-other" }, {}],
    ["an order without booking notes", null, {}],
    ["a ticket the order did not settle", { kind: "repay", eventId: "evt1", ticketCode: "UE-TESTEV-OTHER1" }, { ticketCode: "UE-TESTEV-ABC123" }],
  ])("answers 400 ORDER_MISMATCH for %s", async (_name, booking, extra) => {
    m.fetchOrderBooking.mockResolvedValue(booking)
    const response = await verifyWith({ ...BUYER, ...signedPayment(), ...extra })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe("ORDER_MISMATCH")
    expect(m.registerParticipant).not.toHaveBeenCalled()
  })

  it("answers 409 PHONE_ALREADY_REGISTERED when a legacy index refuses the booking", async () => {
    m.registerParticipant.mockRejectedValue(new Error(PHONE_ALREADY_REGISTERED))
    const response = await verifyWith({ ...BUYER, ...signedPayment() })
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe("PHONE_ALREADY_REGISTERED")
    expect(body.error).toMatch(/payment ID/)
  })

  it("answers 500 REGISTRATION_FAILED, with the reason, when booking closed before the payment", async () => {
    m.registerParticipant.mockRejectedValue(new Error(EVENT_NOT_ACCEPTING))
    const response = await verifyWith({ ...BUYER, ...signedPayment() })
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.code).toBe("REGISTRATION_FAILED")
    expect(body.error).toMatch(/booking for this event has closed/)
  })

  it("answers 500 REGISTRATION_FAILED for any other failure", async () => {
    m.registerParticipant.mockRejectedValue(new Error("write conflict"))
    const response = await verifyWith({ ...BUYER, ...signedPayment() })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      success: false,
      error: "Registration failed. Please contact support with your payment ID.",
      code: "REGISTRATION_FAILED",
    })
  })

  it("is limited to 20 a minute per IP", async () => {
    vi.mocked(verifyRateLimit.limit).mockResolvedValueOnce(limitResult(false))
    const response = await verifyWith({ ...BUYER, ...signedPayment() })
    expect(response.status).toBe(429)
    expect(verifyRateLimit.limit).toHaveBeenCalledWith("203.0.113.9")
    expect(m.findBookingByOrderId).not.toHaveBeenCalled()
  })

  it("settles a re-payment without the buyer fields", async () => {
    m.fetchOrderBooking.mockResolvedValue({ kind: "repay", eventId: "evt1", ticketCode: "UE-TESTEV-ABC123" })
    m.findParticipantByTicketCodeOnly.mockResolvedValue(participantRow({ amountPaid: false, paymentId: null, paymentOrderId: null }))

    const response = await verifyWith({ ...signedPayment(), ticketCode: "ue-testev-abc123" })

    expect(response.status).toBe(200)
    expect(m.updateParticipant).toHaveBeenCalledWith("p1", {
      amountPaid: true,
      entryType: "PAID",
      paymentId: "pay_1",
      paymentOrderId: "order_1",
    })
  })

  it("still wants the buyer fields for a new booking", async () => {
    const { name: _name, ...withoutName } = BUYER
    const response = await verifyWith({ ...withoutName, ...signedPayment() })
    expect(response.status).toBe(400)
    expect(m.findBookingByOrderId).not.toHaveBeenCalled()
  })

  it("records what the order charged, on a new booking and on a re-paid ticket", async () => {
    m.fetchOrderBooking.mockResolvedValue({ ...NEW_BOOKING, amountPaise: 100000 })
    await verifyWith({ ...BUYER, ...signedPayment() })
    expect(m.registerParticipant).toHaveBeenCalledWith(expect.objectContaining({ amountPaidPaise: 100000 }), expect.anything())

    m.fetchOrderBooking.mockResolvedValue({ kind: "repay", eventId: "evt1", ticketCode: "UE-TESTEV-ABC123", amountPaise: 100000 })
    m.findParticipantByTicketCodeOnly.mockResolvedValue(participantRow({ amountPaid: false, paymentId: null, paymentOrderId: null }))
    await verifyWith({ ...signedPayment("order_2", "pay_2"), ticketCode: "UE-TESTEV-ABC123" })
    expect(m.updateParticipant).toHaveBeenCalledWith("p1", {
      amountPaid: true,
      entryType: "PAID",
      paymentId: "pay_2",
      paymentOrderId: "order_2",
      amountPaidPaise: 100000,
    })
  })

  it("logs a second payment on a ticket already paid, for staff to refund, and still answers with the ticket", async () => {
    m.fetchOrderBooking.mockResolvedValue({ kind: "repay", eventId: "evt1", ticketCode: "UE-TESTEV-ABC123", amountPaise: 100000 })
    m.findParticipantByTicketCodeOnly.mockResolvedValue(participantRow({ amountPaid: true, paymentId: "pay_1", paymentOrderId: "order_1" }))

    const response = await verifyWith({ ...signedPayment("order_2", "pay_2"), ticketCode: "UE-TESTEV-ABC123" })

    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ ticketCode: "UE-TESTEV-ABC123", orderId: "order_2" })
    expect(m.updateParticipant).not.toHaveBeenCalled()
    // Written after the response.
    expect(m.logActivity).not.toHaveBeenCalled()
    await Promise.all(m.afterTasks.splice(0).map((task) => task()))
    expect(m.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUsername: "payment-verify",
        action: "PARTICIPANT_UPDATED",
        entityId: "p1",
        metadata: expect.objectContaining({ duplicatePaymentId: "pay_2", orderId: "order_2", paidWith: "pay_1" }),
      })
    )
  })

  it("logs nothing when the payment that settled the ticket is confirmed again", async () => {
    m.fetchOrderBooking.mockResolvedValue({ kind: "repay", eventId: "evt1", ticketCode: "UE-TESTEV-ABC123", amountPaise: 100000 })
    m.findParticipantByTicketCodeOnly.mockResolvedValue(participantRow({ amountPaid: true, paymentId: "pay_2", paymentOrderId: "order_1" }))
    expect((await verifyWith({ ...signedPayment("order_2", "pay_2"), ticketCode: "UE-TESTEV-ABC123" })).status).toBe(200)
    expect(m.afterTasks).toHaveLength(0)
  })
})

describe("POST payment/status", () => {
  const ask = (body: unknown) => paymentStatus(post("payment/status", body), params)

  it("returns the ticket once the order's booking exists and the phone matches", async () => {
    m.findParticipantByOrderId.mockResolvedValue(participantRow({ paymentId: "pay_77", paymentOrderId: "order_1" }))

    const response = await ask({ orderId: "order_1", phone: "9876543210" })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(Object.keys(body.data).sort()).toEqual(TICKET_PAYLOAD_KEYS)
    expect(body.data).toMatchObject({ ticketCode: "UE-TESTEV-ABC123", eventName: "Test Event", paymentId: "pay_77", orderId: "order_1" })
    expect(m.findParticipantByOrderId).toHaveBeenCalledWith("order_1")
    expect(m.findTicketEventBySlug).toHaveBeenCalledWith("test-event")
  })

  it("says pending while the order has no booking", async () => {
    const response = await ask({ orderId: "order_1", phone: "9876543210" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, pending: true })
  })

  it.each([
    ["another phone", participantRow({ phone: "9000000000" })],
    ["a booking on another event", participantRow({ eventId: "evt-other" })],
  ])("answers %s exactly like pending", async (_name, booking) => {
    m.findParticipantByOrderId.mockResolvedValue(booking)
    const response = await ask({ orderId: "order_1", phone: "9876543210" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, pending: true })
  })

  it("answers 404 EVENT_NOT_FOUND for a cancelled or unknown event", async () => {
    m.findTicketEventBySlug.mockResolvedValue(null)
    m.findParticipantByOrderId.mockResolvedValue(participantRow())
    const response = await ask({ orderId: "order_1", phone: "9876543210" })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ success: false, error: "Event not found", code: "EVENT_NOT_FOUND" })
  })

  it.each([
    ["no order id", { phone: "9876543210" }],
    ["an order id over 64 characters", { orderId: "o".repeat(65), phone: "9876543210" }],
    ["a phone that is not 10 digits", { orderId: "order_1", phone: "98765" }],
  ])("answers 400 for %s", async (_name, body) => {
    expect((await ask(body)).status).toBe(400)
    expect(m.findParticipantByOrderId).not.toHaveBeenCalled()
  })

  it("is limited to 30 a minute per IP", async () => {
    vi.mocked(paymentStatusRateLimit.limit).mockResolvedValueOnce(limitResult(false))
    const response = await ask({ orderId: "order_1", phone: "9876543210" })
    expect(response.status).toBe(429)
    expect(paymentStatusRateLimit.limit).toHaveBeenCalledWith("203.0.113.9")
  })
})

describe("POST /api/razorpay/webhook", () => {
  function delivery(body: unknown, signature?: string) {
    const raw = JSON.stringify(body)
    const sig = signature ?? createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest("hex")
    return new NextRequest("http://localhost/api/razorpay/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": sig },
      body: raw,
    })
  }
  const captured = (orderId = "order_1", paymentId = "pay_1") => ({
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
  })
  /** Runs what the route left for after its response. */
  const runAfterTasks = () => Promise.all(m.afterTasks.splice(0).map((task) => task()))

  it("may run for 15 s", () => {
    expect(maxDuration).toBe(15)
  })

  it.each([
    ["a wrong signature", "0".repeat(64)],
    ["a signature that is not hex", "zz"],
    ["no signature", ""],
  ])("refuses %s with 401 and touches nothing", async (_name, signature) => {
    const response = await webhook(delivery(captured(), signature))
    expect(response.status).toBe(401)
    expect(m.findPaymentStateByOrderId).not.toHaveBeenCalled()
    expect(m.fetchOrderBooking).not.toHaveBeenCalled()
  })

  it("ignores other events", async () => {
    const response = await webhook(delivery({ event: "refund.processed" }))
    expect(await response.json()).toEqual({ status: "ignored" })
  })

  it("answers a payment verify already settled from one indexed read, with no Razorpay call", async () => {
    m.findPaymentStateByOrderId.mockResolvedValue({ id: "p1", amountPaid: true })
    const response = await webhook(delivery(captured()))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ok" })
    expect(m.findPaymentStateByOrderId).toHaveBeenCalledWith("order_1")
    expect(m.fetchOrderBooking).not.toHaveBeenCalled()
    expect(m.afterTasks).toHaveLength(0)
  })

  it("gives Razorpay 3 s, and a failed fetch answers 500 so the delivery is retried", async () => {
    m.fetchOrderBooking.mockRejectedValue(new Error("Timed out fetching the Razorpay order"))
    const response = await webhook(delivery(captured()))
    expect(response.status).toBe(500)
    expect(m.fetchOrderBooking).toHaveBeenCalledWith("order_1", 3000)
  })

  it("skips an order without booking notes with 200", async () => {
    m.fetchOrderBooking.mockResolvedValue(null)
    expect(await (await webhook(delivery(captured()))).json()).toEqual({ status: "skipped" })
  })

  it("creates a booking the browser never confirmed, then logs it and asks the site to email it", async () => {
    const response = await webhook(delivery(captured()))

    expect(response.status).toBe(200)
    expect(m.registerParticipant).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt1", paymentOrderId: "order_1", paymentId: "pay_1" }))
    // Nothing waits on the log or the email before the response.
    expect(m.logActivity).not.toHaveBeenCalled()
    expect(m.requestTicketMail).not.toHaveBeenCalled()

    await runAfterTasks()
    expect(m.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "PARTICIPANT_ADDED", entityId: "p1" }))
    expect(m.requestTicketMail).toHaveBeenCalledWith("UE-TESTEV-ABC123", "buyer@example.test")
  })

  it("emails a re-paid ticket once it turns paid", async () => {
    m.fetchOrderBooking.mockResolvedValue({ kind: "repay", eventId: "evt1", ticketCode: "UE-TESTEV-ABC123" })
    m.findParticipantByTicketCodeOnly.mockResolvedValue(participantRow({ amountPaid: false, paymentOrderId: null }))

    await webhook(delivery(captured()))
    expect(m.updateParticipant).toHaveBeenCalledWith("p1", expect.objectContaining({ amountPaid: true, paymentOrderId: "order_1" }))

    await runAfterTasks()
    expect(m.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "PARTICIPANT_UPDATED" }))
    expect(m.requestTicketMail).toHaveBeenCalledWith("UE-TESTEV-ABC123", "buyer@example.test")
  })

  it("sends nothing for a ticket that was already paid", async () => {
    m.fetchOrderBooking.mockResolvedValue({ kind: "repay", eventId: "evt1", ticketCode: "UE-TESTEV-ABC123" })
    m.findParticipantByTicketCodeOnly.mockResolvedValue(participantRow({ amountPaid: true }))
    await webhook(delivery(captured()))
    expect(m.afterTasks).toHaveLength(0)
    expect(m.updateParticipant).not.toHaveBeenCalled()
  })

  it("emails a booking verify recorded but left unpaid, once settled", async () => {
    m.findPaymentStateByOrderId.mockResolvedValue({ id: "p1", amountPaid: false })
    m.findParticipantByEventAndOrderId.mockResolvedValue(participantRow({ amountPaid: false }))
    await webhook(delivery(captured()))
    await runAfterTasks()
    expect(m.requestTicketMail).toHaveBeenCalledWith("UE-TESTEV-ABC123", "buyer@example.test")
  })

  it("sends nothing when verify created the booking in the meantime", async () => {
    m.registerParticipant.mockResolvedValue({ participant: participantRow({ amountPaid: true }), isNew: false })
    await webhook(delivery(captured()))
    expect(m.afterTasks).toHaveLength(0)
  })

  it("records what the order charged, whichever way the booking is settled", async () => {
    m.fetchOrderBooking.mockResolvedValue({ ...NEW_BOOKING, amountPaise: 100000 })
    await webhook(delivery(captured()))
    expect(m.registerParticipant).toHaveBeenCalledWith(expect.objectContaining({ amountPaidPaise: 100000 }))

    m.fetchOrderBooking.mockResolvedValue({ kind: "repay", eventId: "evt1", ticketCode: "UE-TESTEV-ABC123", amountPaise: 100000 })
    m.findParticipantByTicketCodeOnly.mockResolvedValue(participantRow({ amountPaid: false, paymentOrderId: null }))
    await webhook(delivery(captured("order_2", "pay_2")))
    expect(m.updateParticipant).toHaveBeenLastCalledWith("p1", expect.objectContaining({ amountPaid: true, amountPaidPaise: 100000 }))

    // A booking verify recorded but left unpaid.
    m.findPaymentStateByOrderId.mockResolvedValue({ id: "p1", amountPaid: false })
    m.fetchOrderBooking.mockResolvedValue({ ...NEW_BOOKING, amountPaise: 100000 })
    m.findParticipantByEventAndOrderId.mockResolvedValue(participantRow({ amountPaid: false }))
    await webhook(delivery(captured("order_3", "pay_3")))
    expect(m.updateParticipant).toHaveBeenLastCalledWith("p1", {
      amountPaid: true,
      entryType: "PAID",
      paymentId: "pay_3",
      amountPaidPaise: 100000,
    })
  })

  it("logs a second payment on a ticket already paid, and emails nothing", async () => {
    m.fetchOrderBooking.mockResolvedValue({ kind: "repay", eventId: "evt1", ticketCode: "UE-TESTEV-ABC123", amountPaise: 100000 })
    m.findParticipantByTicketCodeOnly.mockResolvedValue(participantRow({ amountPaid: true, paymentId: "pay_1" }))

    const response = await webhook(delivery(captured("order_2", "pay_2")))

    expect(await response.json()).toEqual({ status: "ok" })
    expect(m.updateParticipant).not.toHaveBeenCalled()
    await runAfterTasks()
    expect(m.logActivity).toHaveBeenCalledTimes(1)
    expect(m.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUsername: "razorpay-webhook",
        adminRole: "SYSTEM",
        action: "PARTICIPANT_UPDATED",
        entityId: "p1",
        metadata: expect.objectContaining({ duplicatePaymentId: "pay_2", orderId: "order_2", ticketCode: "UE-TESTEV-ABC123" }),
      })
    )
    expect(m.requestTicketMail).not.toHaveBeenCalled()
  })
})

describe("the signed ticket-mail request to the site", () => {
  type Mail = typeof import("@/lib/site-ticket-mail")
  const actual = () => vi.importActual<Mail>("@/lib/site-ticket-mail")

  afterEach(() => {
    vi.useRealTimers()
  })

  it("signs `${timestamp}.${rawBody}` with HMAC-SHA256 as lowercase hex (fixed vectors)", async () => {
    const { signTicketMail } = await actual()
    // Shared with the site's tests of /api/internal/ticket-mail.
    expect(signTicketMail("test-proxy-secret", "1759572000000", '{"ticketCode":"UE-TESTEV-ABC123"}')).toBe(
      "601a41fb84cb83a92f4b720fa955774729fad837d10ea53cbcbf8219a93fa648"
    )
    expect(
      signTicketMail("test-proxy-secret", "1759572000000", '{"ticketCode":"UE-TESTEV-ABC123","email":"buyer@example.test"}')
    ).toBe("e85ef5d5f927b0ecea057361ab09a556c7a0a44ee996d3813e8eafc7584f3072")
  })

  it("POSTs the signed code and address to SITE_URL/api/internal/ticket-mail", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(1759572000000)
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    const { requestTicketMail } = await actual()

    await requestTicketMail("UE-TESTEV-ABC123", "buyer@example.test")

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://www.ulsaaham.com/api/internal/ticket-mail")
    expect(init.method).toBe("POST")
    expect(init.body).toBe('{"ticketCode":"UE-TESTEV-ABC123","email":"buyer@example.test"}')
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-ulsaham-timestamp": "1759572000000",
      "x-ulsaham-signature": "e85ef5d5f927b0ecea057361ab09a556c7a0a44ee996d3813e8eafc7584f3072",
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it("sends nothing for a booking without an email address", async () => {
    const { requestTicketMail } = await actual()
    await requestTicketMail("UE-TESTEV-ABC123", null)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("only logs when the site refuses or cannot be reached", async () => {
    const { requestTicketMail } = await actual()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }))
    await expect(requestTicketMail("UE-TESTEV-ABC123", "buyer@example.test")).resolves.toBeUndefined()
    vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"))
    await expect(requestTicketMail("UE-TESTEV-ABC123", "buyer@example.test")).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalledTimes(2)
    expect(String(consoleError.mock.calls[0][0])).toMatch(/answered 401/)
  })

  it("sends nothing, and logs, without PROXY_SHARED_SECRET", async () => {
    const saved = process.env.PROXY_SHARED_SECRET
    process.env.PROXY_SHARED_SECRET = ""
    vi.resetModules()
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      const { requestTicketMail } = await actual()
      await requestTicketMail("UE-TESTEV-ABC123", "buyer@example.test")
      expect(fetch).not.toHaveBeenCalled()
      expect(String(consoleError.mock.calls[0][0])).toMatch(/PROXY_SHARED_SECRET is not set/)
    } finally {
      process.env.PROXY_SHARED_SECRET = saved
      consoleWarn.mockRestore()
      vi.resetModules()
    }
  })
})
