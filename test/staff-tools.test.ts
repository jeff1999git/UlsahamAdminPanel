// What staff do from the admin panel: import a guest list from Excel, edit a
// booking's seats, enrol a paying customer at the counter, and the chest
// numbers competitions hand out. The repositories, Razorpay and the activity
// log are replaced; the services, validation and the actions stay real.
import { createHmac } from "node:crypto"
import { Prisma } from "@prisma/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { CONFIRMATION_LOST, runCounterCheckout } from "@/lib/counter-checkout"
import {
  EVENT_FULL,
  EVENT_NOT_ACCEPTING,
  importParticipants,
  registerParticipant,
  updateExistingParticipant,
} from "@/services/participant.service"
import { bulkAddParticipantsAction, type BulkImportRow } from "@/actions/participant.actions"
import { createPaymentOrderAction, verifyAndEnrollAction } from "@/actions/payment.actions"

const m = vi.hoisted(() => ({
  // participant.repository
  findParticipantById: vi.fn(),
  findParticipantByEventAndOrderId: vi.fn(),
  findParticipantByTicketCodeOnly: vi.fn(),
  findBookedPhones: vi.fn(),
  findTicketCodeHolders: vi.fn(),
  createParticipant: vi.fn(),
  createParticipants: vi.fn(),
  updateParticipant: vi.fn(),
  countParticipantsForEvent: vi.fn(),
  // event.repository
  findEventById: vi.fn(),
  allocateCompetitionNumber: vi.fn(),
  allocateCompetitionNumbers: vi.fn(),
  // side effects
  logActivity: vi.fn(),
  ordersCreate: vi.fn(),
  fetchOrderBooking: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.logActivity }))
vi.mock("@/repositories/participant.repository", () => ({
  findParticipantById: m.findParticipantById,
  findParticipantByEventAndOrderId: m.findParticipantByEventAndOrderId,
  findParticipantByTicketCodeOnly: m.findParticipantByTicketCodeOnly,
  findBookedPhones: m.findBookedPhones,
  findTicketCodeHolders: m.findTicketCodeHolders,
  createParticipant: m.createParticipant,
  createParticipants: m.createParticipants,
  updateParticipant: m.updateParticipant,
  countParticipantsForEvent: m.countParticipantsForEvent,
}))
vi.mock("@/repositories/event.repository", () => ({
  findEventById: m.findEventById,
  allocateCompetitionNumber: m.allocateCompetitionNumber,
  allocateCompetitionNumbers: m.allocateCompetitionNumbers,
}))
// safeHexEqual and bookingFromOrderNotes stay real; the Razorpay calls are replaced.
vi.mock("@/lib/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/razorpay")>()),
  getRazorpay: () => ({ orders: { create: m.ordersCreate } }),
  fetchOrderBooking: m.fetchOrderBooking,
}))

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt1",
    name: "Test Event",
    slug: "test-event",
    status: "PUBLISHED",
    date: new Date("2099-01-01T00:00:00.000Z"),
    startTime: "06:00 PM",
    endTime: "09:00 PM",
    capacity: null as number | null,
    isFree: false,
    amount: 500,
    earlyBirdAmount: null,
    isEarlyBird: false,
    gstEnabled: false,
    platformFeeEnabled: false,
    isCompetition: false,
    participationType: "INDIVIDUAL",
    groupExtraAmount: null,
    ...overrides,
  }
}

/** Spreadsheet rows 2, 3, ... with distinct phones, as the import dialog sends them. */
function importRows(count: number, first = 0): BulkImportRow[] {
  return Array.from({ length: count }, (_, i) => ({
    row: first + i + 2,
    name: `Guest ${first + i}`,
    phone: String(9000000000 + first + i),
    email: "",
    age: 30,
    numberOfParticipants: 1,
  }))
}

function uniqueViolation(target: string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
    meta: { target },
  })
}

type Written = { ticketCode: string; phone: string; [field: string]: unknown }
/** Every booking passed to createParticipants, in order. */
const written = () => m.createParticipants.mock.calls.flatMap(([data]) => data as Written[])

function signInAs(role: "USER" | "ADMIN" | "SUPER_ADMIN") {
  vi.mocked(auth).mockResolvedValue({
    user: { id: `id-${role}`, username: role.toLowerCase(), role },
    expires: "2099-01-01T00:00:00.000Z",
  } as never)
}

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  // Each test starts from these answers; nothing set by an earlier test carries over.
  for (const mock of Object.values(m)) mock.mockReset()
  m.findEventById.mockResolvedValue(eventRow())
  m.findBookedPhones.mockResolvedValue(new Set())
  m.findTicketCodeHolders.mockResolvedValue([])
  m.createParticipants.mockImplementation(async (data: unknown[]) => data.length)
  m.createParticipant.mockImplementation(async (data: Record<string, unknown>) => ({ id: "p-new", eventId: "evt1", ...data }))
  m.updateParticipant.mockImplementation(async (id: string, data: Record<string, unknown>) => ({ id, ...data }))
  m.countParticipantsForEvent.mockResolvedValue(0)
  m.findParticipantByEventAndOrderId.mockResolvedValue(null)
  m.allocateCompetitionNumber.mockResolvedValue(1001)
  m.allocateCompetitionNumbers.mockResolvedValue(1001)
  m.logActivity.mockResolvedValue(undefined)
  m.ordersCreate.mockImplementation(async (order: { amount: number }) => ({ id: "order_1", ...order }))
  signInAs("SUPER_ADMIN")
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  consoleError.mockRestore()
})

describe("Excel import", () => {
  it("reads the event, the booked phones and the seat count once, and writes 200 bookings at a time", async () => {
    m.findEventById.mockResolvedValue(eventRow({ capacity: 1000 }))
    const rows = importRows(450)

    const summary = await importParticipants("evt1", rows)

    expect(summary).toEqual({ added: 450, skipped: 0, errors: [] })
    expect(m.findEventById).toHaveBeenCalledTimes(1)
    expect(m.findBookedPhones).toHaveBeenCalledTimes(1)
    expect(m.findBookedPhones).toHaveBeenCalledWith("evt1", rows.map((r) => r.phone))
    expect(m.countParticipantsForEvent).toHaveBeenCalledTimes(1)
    expect(m.createParticipants.mock.calls.map(([data]) => (data as unknown[]).length)).toEqual([200, 200, 50])
    // Nothing goes one booking at a time.
    expect(m.createParticipant).not.toHaveBeenCalled()
    expect(new Set(written().map((b) => b.ticketCode)).size).toBe(450)
  })

  it("adds every row as a paid complimentary booking, as staff adds always are", async () => {
    await importParticipants("evt1", [
      { row: 2, name: "  <b>Asha</b> Nair ", phone: "9876500001", email: "", age: 31, numberOfParticipants: 2 },
      { row: 3, name: "Ravi", phone: "9876500002", email: "ravi@example.test", age: 40, numberOfParticipants: 1 },
    ])

    const [asha, ravi] = written()
    expect(asha).toEqual({
      eventId: "evt1",
      registeredAt: expect.any(Date),
      name: "Asha Nair",
      phone: "9876500001",
      email: null,
      age: 31,
      numberOfParticipants: 2,
      ticketCode: expect.stringMatching(/^UE-TESTEV-[A-Z0-9]{6}$/),
      competitionNumber: null,
      isGroupRegistration: false,
      paymentOrderId: null,
      paymentId: null,
      amountPaid: true,
      entryType: "COMPLIMENTARY",
    })
    expect(ravi).toMatchObject({ email: "ravi@example.test", amountPaid: true, entryType: "COMPLIMENTARY" })
    // Later rows are registered later, so the participants list keeps the file's order.
    expect((ravi.registeredAt as Date).getTime()).toBeGreaterThan((asha.registeredAt as Date).getTime())
    // No seat count without a capacity, and no chest numbers outside a competition.
    expect(m.countParticipantsForEvent).not.toHaveBeenCalled()
    expect(m.allocateCompetitionNumbers).not.toHaveBeenCalled()
  })

  it("skips a phone already on the event and a phone repeated in the file", async () => {
    const rows = importRows(3)
    m.findBookedPhones.mockResolvedValue(new Set([rows[0].phone]))
    const repeat = { ...rows[1], row: 9, name: "Same phone again" }

    const summary = await importParticipants("evt1", [...rows, repeat])

    expect(summary).toEqual({ added: 2, skipped: 2, errors: [] })
    expect(m.findBookedPhones).toHaveBeenCalledWith("evt1", rows.map((r) => r.phone))
    expect(written().map((b) => b.phone)).toEqual([rows[1].phone, rows[2].phone])
  })

  it("refuses rows past the capacity with 'Event is full', counting seats as it goes", async () => {
    m.findEventById.mockResolvedValue(eventRow({ capacity: 5 }))
    m.countParticipantsForEvent.mockResolvedValue(2)
    const [a, b, c] = importRows(3)

    const summary = await importParticipants("evt1", [
      { ...a, numberOfParticipants: 2 },
      { ...b, numberOfParticipants: 2 },
      { ...c, numberOfParticipants: 1 },
    ])

    expect(summary).toEqual({ added: 2, skipped: 0, errors: [{ row: b.row, name: b.name, error: EVENT_FULL }] })
  })

  it("applies the competition's group rule per row; a refused row does not hold its phone", async () => {
    m.findEventById.mockResolvedValue(eventRow({ isCompetition: true, participationType: "GROUP" }))
    const [solo] = importRows(1)
    const group = { ...solo, row: 7, numberOfParticipants: 3 }

    const summary = await importParticipants("evt1", [solo, group])

    expect(summary).toEqual({
      added: 1,
      skipped: 0,
      errors: [{ row: solo.row, name: solo.name, error: "This competition accepts group entries only (minimum 2 members)" }],
    })
    expect(written()).toEqual([expect.objectContaining({ phone: solo.phone, numberOfParticipants: 3, isGroupRegistration: true })])
  })

  it("reserves the chest numbers of a competition in one step, in row order", async () => {
    m.findEventById.mockResolvedValue(eventRow({ isCompetition: true, participationType: "BOTH" }))
    m.allocateCompetitionNumbers.mockResolvedValue(1005)
    const rows = importRows(3).map((row, i) => ({ ...row, numberOfParticipants: i + 1 }))

    await importParticipants("evt1", rows)

    expect(m.allocateCompetitionNumbers).toHaveBeenCalledTimes(1)
    expect(m.allocateCompetitionNumbers).toHaveBeenCalledWith("evt1", 3)
    expect(m.allocateCompetitionNumber).not.toHaveBeenCalled()
    expect(written().map((b) => [b.competitionNumber, b.isGroupRegistration])).toEqual([
      [1005, false],
      [1006, true],
      [1007, true],
    ])
  })

  it("refuses every row while the event is not taking bookings, as one-by-one adds did", async () => {
    m.findEventById.mockResolvedValue(eventRow({ status: "BOOKING_CLOSED" }))
    const rows = importRows(2)
    m.findBookedPhones.mockResolvedValue(new Set([rows[0].phone]))

    const summary = await importParticipants("evt1", rows)

    expect(summary).toEqual({ added: 0, skipped: 1, errors: [{ row: rows[1].row, name: rows[1].name, error: EVENT_NOT_ACCEPTING }] })
    expect(m.createParticipants).not.toHaveBeenCalled()
    expect(m.allocateCompetitionNumbers).not.toHaveBeenCalled()
  })

  it("reports every row when the event no longer exists", async () => {
    m.findEventById.mockResolvedValue(null)
    const rows = importRows(2)
    expect(await importParticipants("evt1", rows)).toEqual({
      added: 0,
      skipped: 0,
      errors: rows.map((r) => ({ row: r.row, name: r.name, error: "Event not found" })),
    })
    expect(m.findBookedPhones).not.toHaveBeenCalled()
  })

  it("after a refused batch, counts the rows MongoDB wrote and adds the rest one at a time", async () => {
    const rows = importRows(4)
    m.createParticipants
      .mockRejectedValueOnce(uniqueViolation("Participant_ticketCode_key")) // the batch of 4
      .mockResolvedValueOnce(1) // row 3 on its own
      .mockRejectedValueOnce(uniqueViolation("Participant_eventId_phone_key")) // row 4 on its own
    m.findTicketCodeHolders.mockImplementation(async () => {
      const batch = m.createParticipants.mock.calls[0][0] as Written[]
      return [
        // Rows 1 and 2 were written before MongoDB stopped.
        { ticketCode: batch[0].ticketCode, eventId: "evt1", phone: batch[0].phone },
        { ticketCode: batch[1].ticketCode, eventId: "evt1", phone: batch[1].phone },
        // Row 3's code belongs to a booking on another event.
        { ticketCode: batch[2].ticketCode, eventId: "evt-other", phone: "9999999999" },
      ]
    })

    const summary = await importParticipants("evt1", rows)

    // Row 4 hit a per-phone unique index from an older schema: already booked, so skipped.
    expect(summary).toEqual({ added: 3, skipped: 1, errors: [] })
    const batch = m.createParticipants.mock.calls[0][0] as Written[]
    expect(m.findTicketCodeHolders).toHaveBeenCalledWith(batch.map((b) => b.ticketCode))
    const [row3] = m.createParticipants.mock.calls[1][0] as Written[]
    const [row4] = m.createParticipants.mock.calls[2][0] as Written[]
    expect(row3.phone).toBe(rows[2].phone)
    expect(row3.ticketCode).not.toBe(batch[2].ticketCode)
    expect(row4).toEqual(batch[3])
  })

  it("reports a row whose ticket code keeps clashing", async () => {
    m.createParticipants.mockRejectedValue(uniqueViolation("Participant_ticketCode_key"))
    const [row] = importRows(1)
    expect(await importParticipants("evt1", [row])).toEqual({
      added: 0,
      skipped: 0,
      errors: [{ row: row.row, name: row.name, error: "Could not allocate a unique ticket code. Please try again." }],
    })
    // The batch, then three tries on its own with a new code each time after the first.
    expect(m.createParticipants).toHaveBeenCalledTimes(4)
  })

  it("stops on a failure that is not a unique index", async () => {
    m.createParticipants.mockRejectedValue(new Error("connection reset"))
    await expect(importParticipants("evt1", importRows(2))).rejects.toThrow("connection reset")
  })
})

describe("bulkAddParticipantsAction", () => {
  it("imports, logs the count and returns the summary", async () => {
    const result = await bulkAddParticipantsAction("evt1", importRows(2))

    expect(result).toEqual({ success: true, data: { added: 2, skipped: 0, errors: [] } })
    expect(m.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PARTICIPANT_ADDED", description: "Bulk imported 2 participants from Excel (0 skipped, 0 failed)" })
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/events/evt1/participants")
  })

  it("refuses more than 1,000 rows before touching the database", async () => {
    const result = await bulkAddParticipantsAction("evt1", importRows(1001))
    expect(result).toEqual({
      success: false,
      error: "One import can add at most 1,000 rows. Split the file and import each part.",
    })
    expect(m.findEventById).not.toHaveBeenCalled()
  })

  it("checks every row on the server and names the spreadsheet row at fault", async () => {
    const rows = importRows(3)
    rows[1] = { ...rows[1], row: 7, phone: "12345" }
    expect(await bulkAddParticipantsAction("evt1", rows)).toEqual({
      success: false,
      error: "Row 7: Phone number must be exactly 10 digits",
    })
    expect(await bulkAddParticipantsAction("evt1", [{ ...rows[0], numberOfParticipants: 0 }])).toEqual({
      success: false,
      error: "Row 2: At least 1 participant required",
    })
    expect(m.findEventById).not.toHaveBeenCalled()
  })

  it("says what to do when the import stops part-way", async () => {
    m.createParticipants.mockRejectedValue(new Error("connection reset"))
    const result = await bulkAddParticipantsAction("evt1", importRows(2))
    expect(result).toEqual({
      success: false,
      error: "The import stopped part-way. Refresh the page to see who was added; importing the same file again skips them.",
    })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/events/evt1/participants")
    expect(m.logActivity).not.toHaveBeenCalled()
  })
})

describe("editing a booking's seats", () => {
  function booking(overrides: Record<string, unknown> = {}, event: Record<string, unknown> = {}) {
    return {
      id: "p1",
      eventId: "evt1",
      name: "Test Person",
      numberOfParticipants: 4,
      enteredCount: 0,
      isGroupRegistration: false,
      ...overrides,
      event: { isCompetition: false, participationType: "INDIVIDUAL", ...event },
    }
  }

  it("never drops below the people already let in", async () => {
    m.findParticipantById.mockResolvedValue(booking({ enteredCount: 3 }))
    await expect(updateExistingParticipant("p1", { numberOfParticipants: 2 })).rejects.toThrow(
      "3 people have already entered on this ticket, so it needs at least 3 seats"
    )
    m.findParticipantById.mockResolvedValue(booking({ numberOfParticipants: 2, enteredCount: 1 }))
    await expect(updateExistingParticipant("p1", { numberOfParticipants: 0 })).rejects.toThrow(
      "1 person has already entered on this ticket, so it needs at least 1 seat"
    )
    expect(m.updateParticipant).not.toHaveBeenCalled()

    m.findParticipantById.mockResolvedValue(booking({ enteredCount: 3 }))
    await updateExistingParticipant("p1", { numberOfParticipants: 3 })
    expect(m.updateParticipant).toHaveBeenCalledWith("p1", { numberOfParticipants: 3, isGroupRegistration: false })
  })

  it.each<[string, string, number, string]>([
    ["an individual-only competition", "INDIVIDUAL", 2, "This competition accepts individual entries only"],
    ["a group-only competition", "GROUP", 1, "This competition accepts group entries only (minimum 2 members)"],
  ])("follows the entry rule of %s", async (_name, participationType, seats, error) => {
    m.findParticipantById.mockResolvedValue(booking({ numberOfParticipants: participationType === "GROUP" ? 3 : 1 }, { isCompetition: true, participationType }))
    await expect(updateExistingParticipant("p1", { numberOfParticipants: seats })).rejects.toThrow(error)
    expect(m.updateParticipant).not.toHaveBeenCalled()
  })

  it("recomputes the group flag with the seats", async () => {
    m.findParticipantById.mockResolvedValue(booking({ numberOfParticipants: 1 }, { isCompetition: true, participationType: "BOTH" }))
    await updateExistingParticipant("p1", { numberOfParticipants: 3 })
    expect(m.updateParticipant).toHaveBeenLastCalledWith("p1", { numberOfParticipants: 3, isGroupRegistration: true })

    m.findParticipantById.mockResolvedValue(booking({ numberOfParticipants: 3, isGroupRegistration: true }, { isCompetition: true, participationType: "BOTH" }))
    await updateExistingParticipant("p1", { numberOfParticipants: 1 })
    expect(m.updateParticipant).toHaveBeenLastCalledWith("p1", { numberOfParticipants: 1, isGroupRegistration: false })

    // Outside a competition a booking is never a group entry.
    m.findParticipantById.mockResolvedValue(booking({ numberOfParticipants: 1 }))
    await updateExistingParticipant("p1", { numberOfParticipants: 5 })
    expect(m.updateParticipant).toHaveBeenLastCalledWith("p1", { numberOfParticipants: 5, isGroupRegistration: false })
  })

  it("leaves an unchanged seat count alone, and never checks capacity", async () => {
    // A booking made before the event's rule changed can still have its name fixed.
    m.findParticipantById.mockResolvedValue(booking({ numberOfParticipants: 3 }, { isCompetition: true, participationType: "INDIVIDUAL" }))
    await updateExistingParticipant("p1", { name: " Renamed ", numberOfParticipants: 3 })
    expect(m.updateParticipant).toHaveBeenCalledWith("p1", { name: "Renamed" })
    expect(m.countParticipantsForEvent).not.toHaveBeenCalled()
  })
})

describe("chest numbers", () => {
  const BUYER = { name: "Test Person", phone: "9876543210", email: null, age: 30, numberOfParticipants: 1 }

  it("an order already booked is answered without taking a number", async () => {
    m.findParticipantByEventAndOrderId.mockResolvedValue({ id: "p1", paymentOrderId: "order_1", competitionNumber: 1004 })
    m.findEventById.mockResolvedValue(eventRow({ isCompetition: true, participationType: "BOTH" }))

    const result = await registerParticipant({ eventId: "evt1", ...BUYER, paymentOrderId: "order_1" })

    expect(result.isNew).toBe(false)
    expect(m.allocateCompetitionNumber).not.toHaveBeenCalled()
  })

  it("a new booking takes one number, only after the replay lookup missed", async () => {
    m.findEventById.mockResolvedValue(eventRow({ isCompetition: true, participationType: "BOTH" }))
    m.allocateCompetitionNumber.mockResolvedValue(1042)

    await registerParticipant({ eventId: "evt1", ...BUYER, paymentOrderId: "order_1" })

    expect(m.allocateCompetitionNumber).toHaveBeenCalledTimes(1)
    expect(m.allocateCompetitionNumber).toHaveBeenCalledWith("evt1")
    expect(m.findParticipantByEventAndOrderId.mock.invocationCallOrder[0]).toBeLessThan(
      m.allocateCompetitionNumber.mock.invocationCallOrder[0]
    )
    expect(m.createParticipant).toHaveBeenCalledWith(expect.objectContaining({ competitionNumber: 1042 }))
  })
})

describe("the counter's Razorpay Checkout", () => {
  type CheckoutOptions = ConstructorParameters<Window["Razorpay"]>[0]
  const RESPONSE = { razorpay_payment_id: "pay_1", razorpay_order_id: "order_1", razorpay_signature: "sig" }
  const OPTIONS = { key: "rzp_test_dummy", amount: 60000, currency: "INR", name: "Ulsaham Entertainments", order_id: "order_1" }

  /** A stand-in for window.Razorpay that keeps the options it was opened with. */
  function fakeCheckout(onOpen?: () => void) {
    const opened: CheckoutOptions[] = []
    class Checkout {
      constructor(options: CheckoutOptions) {
        opened.push(options)
      }
      open() {
        onOpen?.()
      }
    }
    return { Checkout: Checkout as unknown as Window["Razorpay"], opened }
  }

  it("opens with the order and settles as enrolled once the server confirms", async () => {
    const { Checkout, opened } = fakeCheckout()
    const confirm = vi.fn(async () => ({ success: true as const, data: null }))
    const outcome = runCounterCheckout(Checkout, OPTIONS, confirm)

    expect(opened[0]).toMatchObject(OPTIONS)
    opened[0].handler(RESPONSE)
    expect(await outcome).toEqual({ status: "enrolled" })
    expect(confirm).toHaveBeenCalledWith(RESPONSE)
  })

  it("passes on the server's refusal, naming the payment Razorpay took", async () => {
    const { Checkout, opened } = fakeCheckout()
    const outcome = runCounterCheckout(Checkout, OPTIONS, async () => ({
      success: false as const,
      error: "This payment does not match this enrolment.",
    }))
    opened[0].handler(RESPONSE)
    expect(await outcome).toEqual({ status: "failed", error: "This payment does not match this enrolment.", paymentId: "pay_1" })
  })

  it("settles, with a warning not to charge again, when the confirmation never reaches the server", async () => {
    const { Checkout, opened } = fakeCheckout()
    const outcome = runCounterCheckout(Checkout, OPTIONS, async () => {
      throw new TypeError("Failed to fetch")
    })
    opened[0].handler(RESPONSE)
    expect(await outcome).toEqual({ status: "failed", error: CONFIRMATION_LOST, paymentId: "pay_1" })
    expect(CONFIRMATION_LOST).toBe(
      "Payment received — confirmation didn't reach the server. Check the participant list before charging again."
    )
  })

  it("settles as dismissed when the window is closed without paying", async () => {
    const { Checkout, opened } = fakeCheckout()
    const outcome = runCounterCheckout(Checkout, OPTIONS, vi.fn())
    opened[0].modal?.ondismiss?.()
    expect(await outcome).toEqual({ status: "dismissed" })
  })

  it("settles when Checkout cannot open", async () => {
    const { Checkout } = fakeCheckout(() => {
      throw new Error("blocked")
    })
    expect(await runCounterCheckout(Checkout, OPTIONS, vi.fn())).toEqual({
      status: "failed",
      error: "Could not open the payment window. Please try again.",
    })
  })
})

describe("counter payments", () => {
  const BUYER = { name: "Test Person", phone: "9876543210", email: "", age: 30, numberOfParticipants: 1 }

  function signedPayment(orderId: string, paymentId: string) {
    const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex")
    return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }
  }

  it.each<[string, Record<string, unknown>, string]>([
    ["has ended (still stored as Published)", { date: new Date("2020-01-01T00:00:00.000Z") }, "Booking is closed — this event has ended."],
    ["is cancelled", { status: "CANCELLED" }, "This event has been cancelled."],
    ["has booking closed", { status: "BOOKING_CLOSED" }, "Booking is closed for this event."],
    ["is not published yet", { status: "ANNOUNCED" }, "Booking has not opened for this event yet."],
  ])("takes no money for an event that %s", async (_name, overrides, error) => {
    signInAs("USER")
    m.findEventById.mockResolvedValue(eventRow(overrides))
    expect(await createPaymentOrderAction("evt1", BUYER)).toEqual({ success: false, error })
    expect(m.ordersCreate).not.toHaveBeenCalled()
  })

  it("creates the order while the event takes bookings", async () => {
    signInAs("USER")
    expect(await createPaymentOrderAction("evt1", BUYER)).toMatchObject({ success: true, data: { orderId: "order_1", amount: 50000 } })
  })

  it("records what the order charged on the booking", async () => {
    signInAs("USER")
    m.fetchOrderBooking.mockResolvedValue({
      kind: "new",
      eventId: "evt1",
      name: "Test Person",
      phone: "9876543210",
      email: null,
      age: 30,
      numberOfParticipants: 1,
      amountPaise: 59000,
    })

    const result = await verifyAndEnrollAction(signedPayment("order_1", "pay_1"), "evt1", {})

    expect(result).toMatchObject({ success: true })
    expect(m.createParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaidPaise: 59000, paymentOrderId: "order_1", paymentId: "pay_1", entryType: "PAID" })
    )
  })

  it("leaves the charge out of a booking whose order amount is unknown", async () => {
    await registerParticipant({ eventId: "evt1", name: "Test Person", phone: "9876543210", age: 30, numberOfParticipants: 1, amountPaidPaise: null })
    expect(m.createParticipant.mock.calls[0][0]).not.toHaveProperty("amountPaidPaise")
  })
})
