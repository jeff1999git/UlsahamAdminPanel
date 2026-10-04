// The golden fee table (test/fixtures/fee-cases.json) run against src/lib/pricing.ts
// and against the two places that turn it into a Razorpay order: the public
// payment/order route and the staff counter's createPaymentOrderAction. The
// customer site mirrors the same JSON, so both sides charge the same total.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import feeTable from "./fixtures/fee-cases.json"
import {
  GST_RATE,
  PLATFORM_FEE_RATE,
  calculateCompetitionBase,
  calculateCompetitionFees,
  calculateTicketFees,
  getEffectiveAmount,
} from "@/lib/pricing"

type FeeCase = {
  id: string
  event: {
    isFree: boolean
    amount: number | null
    isEarlyBird: boolean
    earlyBirdAmount: number | null
    gstEnabled: boolean
    platformFeeEnabled: boolean
    isCompetition: boolean
    groupExtraAmount: number | null
  }
  quantity: number
  couponDiscount: number
  expected: {
    effectiveAmount: number | null
    base?: number
    discount?: number
    discountedBase?: number
    gst?: number
    platformFee?: number
    total?: number
    totalPaise?: number
  }
}

const cases = feeTable.cases as FeeCase[]
const chargeable = cases.filter((c) => c.expected.effectiveAmount !== null)
const MONEY_FIELDS = ["base", "discount", "discountedBase", "gst", "platformFee", "total"] as const

/** What the order routes do with an event and a basket. */
function breakdownFor(c: FeeCase, effectiveAmount: number) {
  const { event, quantity, couponDiscount } = c
  return event.isCompetition
    ? calculateCompetitionFees(effectiveAmount, event.groupExtraAmount, quantity, couponDiscount, event.gstEnabled, event.platformFeeEnabled)
    : calculateTicketFees(effectiveAmount, quantity, couponDiscount, event.gstEnabled, event.platformFeeEnabled)
}

describe("golden fee table", () => {
  it("uses the rates the table was written for", () => {
    expect(GST_RATE).toBe(feeTable.rates.gst)
    expect(PLATFORM_FEE_RATE).toBe(feeTable.rates.platformFee)
  })

  it("has unique case ids and covers every pricing switch", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length)
    const has = (pred: (c: FeeCase) => boolean) => chargeable.some(pred)
    expect(has((c) => c.event.isEarlyBird && c.event.earlyBirdAmount !== null)).toBe(true)
    expect(has((c) => c.event.isCompetition && c.event.groupExtraAmount === null && c.quantity > 1)).toBe(true)
    expect(has((c) => !c.event.gstEnabled && !c.event.platformFeeEnabled)).toBe(true)
    expect(has((c) => c.event.gstEnabled && !c.event.platformFeeEnabled)).toBe(true)
    expect(has((c) => !c.event.gstEnabled && c.event.platformFeeEnabled)).toBe(true)
    expect(has((c) => c.couponDiscount > 0 && c.couponDiscount >= (c.expected.base ?? 0))).toBe(true)
    expect(cases.some((c) => c.expected.effectiveAmount === null)).toBe(true)
  })

  it.each(cases.map((c) => [c.id, c] as const))("%s: effective amount", (_id, c) => {
    expect(getEffectiveAmount(c.event)).toBe(c.expected.effectiveAmount)
  })

  it.each(chargeable.map((c) => [c.id, c] as const))("%s: breakdown and paise", (_id, c) => {
    const breakdown = breakdownFor(c, c.expected.effectiveAmount!)
    for (const field of MONEY_FIELDS) {
      expect(breakdown[field], field).toBeCloseTo(c.expected[field]!, 2)
    }
    expect(Math.round(breakdown.total * 100)).toBe(c.expected.totalPaise)
    // The parts the site shows must add up to what is charged.
    expect(breakdown.discountedBase + breakdown.gst + breakdown.platformFee).toBeCloseTo(breakdown.total, 2)
  })
})

describe("calculateCompetitionBase", () => {
  it("charges the first member the individual price and each further member the group rate", () => {
    expect(calculateCompetitionBase(500, 200, 1)).toBe(500)
    expect(calculateCompetitionBase(500, 200, 2)).toBe(700)
    expect(calculateCompetitionBase(500, 200, 3)).toBe(900)
  })

  it("falls back to the individual price when no group rate is set", () => {
    expect(calculateCompetitionBase(500, null, 3)).toBe(1500)
    expect(calculateCompetitionBase(500, undefined, 3)).toBe(1500)
  })

  it("never charges less than one member", () => {
    expect(calculateCompetitionBase(500, 200, 0)).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// The charge paths. Every dependency that would reach MongoDB or Razorpay is
// replaced; pricing, validation and competition rules stay real.

const mocks = vi.hoisted(() => ({
  getBookableEventBySlug: vi.fn(),
  findEventById: vi.fn(),
  countParticipantsForEvent: vi.fn(async () => 0),
  findParticipantByTicketCodeOnly: vi.fn(async () => null),
  ordersCreate: vi.fn(async (order: { amount: number }) => ({ id: "order_test", ...order })),
}))

vi.mock("@/services/event.service", () => ({
  getBookableEventBySlug: mocks.getBookableEventBySlug,
}))
vi.mock("@/repositories/event.repository", () => ({ findEventById: mocks.findEventById }))
vi.mock("@/repositories/participant.repository", () => ({
  countParticipantsForEvent: mocks.countParticipantsForEvent,
  findParticipantByTicketCodeOnly: mocks.findParticipantByTicketCodeOnly,
}))
// withTimeout stays real; the order itself goes to the mock.
vi.mock("@/lib/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/razorpay")>()),
  getRazorpay: () => ({ orders: { create: mocks.ordersCreate } }),
  fetchOrderBooking: vi.fn(),
}))
vi.mock("@/lib/index-guard", () => ({ legacyIndexBlocksPhone: vi.fn(async () => false) }))
vi.mock("@/services/participant.service", () => ({ registerParticipant: vi.fn() }))
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const BUYER = { name: "Test Buyer", phone: "9876543210", email: "buyer@example.test", age: 30 }

/** An event row as the database holds it, priced like the fee case. */
function eventRow(c: FeeCase) {
  return {
    id: "evt_golden_1",
    name: `Golden ${c.id}`,
    slug: "golden",
    status: "PUBLISHED" as const,
    capacity: null,
    participationType: c.event.isCompetition ? ("BOTH" as const) : ("INDIVIDUAL" as const),
    ...c.event,
  }
}

describe("charge paths use the golden table", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Razorpay refuses orders under 100 paise, so a coupon that zeroes the order
  // is not a charge path.
  const payable = chargeable.filter((c) => c.expected.totalPaise! >= 100)

  it.each(payable.map((c) => [c.id, c] as const))("public order route: %s", async (_id, c) => {
    const { POST } = await import("@/app/api/public/events/[slug]/payment/order/route")
    const event = eventRow(c)
    mocks.getBookableEventBySlug.mockResolvedValue({
      ...event,
      couponCodes: [{ code: "GOLDEN", discount: c.couponDiscount }],
      complimentaryCodes: [],
      effectiveAmount: getEffectiveAmount(event),
      bookingClosedReason: null,
      bookingClosedMessage: null,
    })

    const request = new NextRequest("http://localhost/api/public/events/golden/payment/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...BUYER,
        numberOfParticipants: c.quantity,
        ...(c.couponDiscount > 0 ? { couponCode: "golden" } : {}),
      }),
    })
    const response = await POST(request, { params: Promise.resolve({ slug: "golden" }) })
    const body = await response.json()

    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(mocks.ordersCreate).toHaveBeenCalledTimes(1)
    expect(mocks.ordersCreate.mock.calls[0][0].amount).toBe(c.expected.totalPaise)
    expect(body.data.amount).toBe(c.expected.totalPaise)
  })

  // The counter takes no coupons.
  const counter = payable.filter((c) => c.couponDiscount === 0)

  it.each(counter.map((c) => [c.id, c] as const))("staff counter order: %s", async (_id, c) => {
    const { auth } = await import("@/lib/auth")
    const { createPaymentOrderAction } = await import("@/actions/payment.actions")
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", username: "counter", role: "USER" },
      expires: "2099-01-01T00:00:00.000Z",
    } as never)
    mocks.findEventById.mockResolvedValue(eventRow(c))

    const result = await createPaymentOrderAction("evt_golden_1", { ...BUYER, numberOfParticipants: c.quantity })

    expect(result).toMatchObject({ success: true, data: { amount: c.expected.totalPaise } })
    expect(mocks.ordersCreate.mock.calls[0][0].amount).toBe(c.expected.totalPaise)
  })
})
