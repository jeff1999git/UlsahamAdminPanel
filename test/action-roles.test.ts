// Role matrix for every exported server action. Each action runs as signed
// out, USER, ADMIN and SUPER_ADMIN with the session from the mocked auth().
// A refused call must end in Unauthorized/Forbidden without touching a
// repository, service or the activity log; an allowed call must get through
// to its service. Every export needs a row, so a new action fails here until
// someone decides who may call it.
import { createHmac } from "node:crypto"
import type { Mock } from "vitest"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { auth, signIn, signOut } from "@/lib/auth"
import * as adminActions from "@/actions/admin.actions"
import * as authActions from "@/actions/auth.actions"
import * as eventActions from "@/actions/event.actions"
import * as participantActions from "@/actions/participant.actions"
import * as paymentActions from "@/actions/payment.actions"
import * as settingsActions from "@/actions/settings.actions"

const m = vi.hoisted(() => {
  const paidEvent = {
    id: "evt1",
    name: "Test Event",
    slug: "test-event",
    status: "PUBLISHED",
    isFree: false,
    amount: 500,
    isEarlyBird: false,
    earlyBirdAmount: null,
    gstEnabled: true,
    platformFeeEnabled: true,
    isCompetition: false,
    participationType: "INDIVIDUAL",
    groupExtraAmount: null,
    capacity: null,
  }
  const participant = {
    id: "p1",
    eventId: "evt1",
    name: "Test Person",
    phone: "9876543210",
    email: null,
    age: 30,
    ticketCode: "UE-ABC123",
    numberOfParticipants: 2,
    enteredCount: 0,
    attended: false,
  }
  return {
    paidEvent,
    participant,
    // next
    revalidatePath: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT ${url}`)
    }),
    // lib
    logActivity: vi.fn(async () => undefined),
    deleteImage: vi.fn(async () => undefined),
    hash: vi.fn(async () => "hashed-password"),
    ordersCreate: vi.fn(async (order: { amount: number }) => ({ id: "order_1", ...order })),
    fetchOrderBooking: vi.fn(async () => ({
      kind: "new",
      eventId: "evt1",
      name: "Test Person",
      phone: "9876543210",
      email: null,
      age: 30,
      numberOfParticipants: 1,
    })),
    // services
    createNewEvent: vi.fn(async () => paidEvent),
    updateExistingEvent: vi.fn(async () => paidEvent),
    deleteEventWithCleanup: vi.fn(async () => paidEvent),
    toggleEventStatus: vi.fn(async () => paidEvent),
    getEventById: vi.fn(async () => paidEvent),
    registerParticipant: vi.fn(async () => ({ participant, isNew: true })),
    updateExistingParticipant: vi.fn(async () => participant),
    deleteParticipantWithCleanup: vi.fn(async () => participant),
    toggleAttendance: vi.fn(async () => ({ ...participant, attended: true })),
    getAllParticipants: vi.fn(async () => [participant]),
    scanForEntry: vi.fn(async () => ({ found: true, participant })),
    scanForEntryGlobal: vi.fn(async () => ({
      found: true,
      participant: { ...participant, event: { id: "evt1", name: "Test Event", date: new Date("2026-10-03"), venue: "Hall" } },
    })),
    markEntry: vi.fn(async () => ({ ...participant, enteredCount: 1 })),
    // repositories
    findEventById: vi.fn(async (): Promise<Record<string, unknown> | null> => paidEvent),
    findParticipantByEventAndPhone: vi.fn(async () => null),
    countParticipantsForEvent: vi.fn(async () => 0),
    findAdminByUsername: vi.fn(async () => null),
    findAdminRoleByUsername: vi.fn(async () => ({ role: "ADMIN" })),
    findAdminById: vi.fn(async () => ({ id: "adm2", username: "staff", role: "ADMIN" })),
    createAdminAccount: vi.fn(async () => ({ id: "adm2", username: "new_staff" })),
    toggleAdminActive: vi.fn(async () => undefined),
    updateAdminPassword: vi.fn(async () => undefined),
    deleteAdminAccount: vi.fn(async () => undefined),
    upsertSettings: vi.fn(async () => ({ id: "s1" })),
    addBrandPartner: vi.fn(async () => undefined),
    removeBrandPartner: vi.fn(async () => undefined),
  }
})

vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }))
vi.mock("next/navigation", () => ({ redirect: m.redirect }))
// auth.actions needs only AuthError; next-auth's ESM build does not load in
// plain Node (it imports "next/server" without an extension).
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {
    type = "AuthError"
  },
}))
vi.mock("bcryptjs", () => ({ default: { hash: m.hash, compare: vi.fn() } }))
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.logActivity }))
vi.mock("@/lib/cloudinary", () => ({ deleteImage: m.deleteImage }))
vi.mock("@/lib/razorpay", () => ({
  getRazorpay: () => ({ orders: { create: m.ordersCreate } }),
  fetchOrderBooking: m.fetchOrderBooking,
}))
vi.mock("@/services/event.service", () => ({
  createNewEvent: m.createNewEvent,
  updateExistingEvent: m.updateExistingEvent,
  deleteEventWithCleanup: m.deleteEventWithCleanup,
  toggleEventStatus: m.toggleEventStatus,
  getEventById: m.getEventById,
}))
vi.mock("@/services/participant.service", () => ({
  registerParticipant: m.registerParticipant,
  updateExistingParticipant: m.updateExistingParticipant,
  deleteParticipantWithCleanup: m.deleteParticipantWithCleanup,
  toggleAttendance: m.toggleAttendance,
  getAllParticipants: m.getAllParticipants,
  scanForEntry: m.scanForEntry,
  scanForEntryGlobal: m.scanForEntryGlobal,
  markEntry: m.markEntry,
}))
vi.mock("@/repositories/event.repository", () => ({ findEventById: m.findEventById }))
vi.mock("@/repositories/participant.repository", () => ({
  findParticipantByEventAndPhone: m.findParticipantByEventAndPhone,
  countParticipantsForEvent: m.countParticipantsForEvent,
}))
vi.mock("@/repositories/admin.repository", () => ({
  findAdminByUsername: m.findAdminByUsername,
  findAdminRoleByUsername: m.findAdminRoleByUsername,
  findAdminById: m.findAdminById,
  createAdminAccount: m.createAdminAccount,
  toggleAdminActive: m.toggleAdminActive,
  updateAdminPassword: m.updateAdminPassword,
  deleteAdminAccount: m.deleteAdminAccount,
}))
vi.mock("@/repositories/settings.repository", () => ({
  upsertSettings: m.upsertSettings,
  addBrandPartner: m.addBrandPartner,
  removeBrandPartner: m.removeBrandPartner,
}))

type Role = "SIGNED_OUT" | "USER" | "ADMIN" | "SUPER_ADMIN"
const ROLES: Role[] = ["SIGNED_OUT", "USER", "ADMIN", "SUPER_ADMIN"]
type Verdict = "deny" | "allow"
type Access = Record<Role, Verdict>

// Who may call an action, derived from the action's own check and the page
// guard of every page that uses it.
const SUPER_ADMIN_ONLY: Access = { SIGNED_OUT: "deny", USER: "deny", ADMIN: "deny", SUPER_ADMIN: "allow" }
const STAFF: Access = { SIGNED_OUT: "deny", USER: "deny", ADMIN: "allow", SUPER_ADMIN: "allow" }
const SIGNED_IN: Access = { SIGNED_OUT: "deny", USER: "allow", ADMIN: "allow", SUPER_ADMIN: "allow" }
const PUBLIC: Access = { SIGNED_OUT: "allow", USER: "allow", ADMIN: "allow", SUPER_ADMIN: "allow" }

type Row = {
  access: Access
  /** Calls the action with input that passes validation. */
  call: () => Promise<unknown>
  /** The first downstream call an allowed request must reach. */
  reaches: Mock
}

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const BUYER = { name: "Test Person", phone: "9876543210", email: "", age: 30, numberOfParticipants: 1 }
const NEW_EVENT = {
  name: "Test Event",
  slug: "test-event",
  description: "A description long enough to pass.",
  bannerImageUrl: "https://res.cloudinary.com/test-cloud/image/upload/banner.jpg",
  bannerImageId: "ulsaham/events/banner",
  venue: "Main Hall",
  date: "2099-01-01",
  startTime: "06:00 PM",
  endTime: "09:00 PM",
  isFree: true,
  status: "ANNOUNCED",
  featured: false,
}

function signedPayment(orderId: string, paymentId: string) {
  const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest("hex")
  return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }
}

const MATRIX: Record<string, { module: Record<string, unknown>; rows: Record<string, Row> }> = {
  "admin.actions": {
    module: adminActions,
    rows: {
      createAdminAction: {
        access: SUPER_ADMIN_ONLY,
        call: () =>
          adminActions.createAdminAction(
            form({ username: "new_staff", password: "password123", confirmPassword: "password123", role: "USER" })
          ),
        reaches: m.createAdminAccount,
      },
      toggleAdminActiveAction: {
        access: SUPER_ADMIN_ONLY,
        call: () => adminActions.toggleAdminActiveAction("adm2", false),
        reaches: m.toggleAdminActive,
      },
      resetAdminPasswordAction: {
        access: SUPER_ADMIN_ONLY,
        call: () =>
          adminActions.resetAdminPasswordAction(
            form({ adminId: "adm2", newPassword: "password123", confirmPassword: "password123" })
          ),
        reaches: m.updateAdminPassword,
      },
      deleteAdminAction: {
        access: SUPER_ADMIN_ONLY,
        call: () => adminActions.deleteAdminAction("adm2"),
        reaches: m.deleteAdminAccount,
      },
    },
  },
  "auth.actions": {
    module: authActions,
    rows: {
      // Signing in and out needs no session by design.
      loginAction: {
        access: PUBLIC,
        call: () => authActions.loginAction(null, form({ username: "someone", password: "password123" })),
        reaches: signIn as unknown as Mock,
      },
      logoutAction: {
        access: PUBLIC,
        call: () => authActions.logoutAction(),
        reaches: signOut as unknown as Mock,
      },
    },
  },
  "event.actions": {
    module: eventActions,
    rows: {
      createEventAction: {
        access: SUPER_ADMIN_ONLY,
        call: () => eventActions.createEventAction(NEW_EVENT),
        reaches: m.createNewEvent,
      },
      updateEventAction: {
        access: SUPER_ADMIN_ONLY,
        call: () => eventActions.updateEventAction({ id: "evt1", name: "Renamed Event" }),
        reaches: m.updateExistingEvent,
      },
      deleteEventAction: {
        access: SUPER_ADMIN_ONLY,
        call: () => eventActions.deleteEventAction("evt1"),
        reaches: m.deleteEventWithCleanup,
      },
      toggleEventStatusAction: {
        access: SUPER_ADMIN_ONLY,
        call: () => eventActions.toggleEventStatusAction("evt1", "BOOKING_CLOSED"),
        reaches: m.toggleEventStatus,
      },
    },
  },
  "participant.actions": {
    module: participantActions,
    rows: {
      // USER may add only to a free event (tested below); this row uses a paid one.
      addParticipantAction: {
        access: STAFF,
        call: () => participantActions.addParticipantAction("evt1", BUYER),
        reaches: m.registerParticipant,
      },
      updateParticipantAction: {
        access: SUPER_ADMIN_ONLY,
        call: () =>
          participantActions.updateParticipantAction("p1", "evt1", {
            name: "Renamed Person",
            email: "",
            age: 31,
            numberOfParticipants: 2,
          }),
        reaches: m.updateExistingParticipant,
      },
      deleteParticipantAction: {
        access: SUPER_ADMIN_ONLY,
        call: () => participantActions.deleteParticipantAction("p1", "evt1"),
        reaches: m.deleteParticipantWithCleanup,
      },
      toggleAttendanceAction: {
        access: STAFF,
        call: () => participantActions.toggleAttendanceAction("p1", "evt1", true),
        reaches: m.toggleAttendance,
      },
      scanAttendanceAction: {
        access: STAFF,
        call: () => participantActions.scanAttendanceAction("UE-ABC123", "evt1"),
        reaches: m.scanForEntry,
      },
      confirmEntryAction: {
        access: STAFF,
        call: () => participantActions.confirmEntryAction("p1", "evt1", 1),
        reaches: m.markEntry,
      },
      scanGlobalAttendanceAction: {
        access: STAFF,
        call: () => participantActions.scanGlobalAttendanceAction("UE-ABC123"),
        reaches: m.scanForEntryGlobal,
      },
      confirmGlobalEntryAction: {
        access: STAFF,
        call: () => participantActions.confirmGlobalEntryAction("p1", "evt1", 1),
        reaches: m.markEntry,
      },
      bulkAddParticipantsAction: {
        access: SUPER_ADMIN_ONLY,
        call: () =>
          participantActions.bulkAddParticipantsAction("evt1", [
            { row: 2, name: "Imported Person", phone: "9876500000", email: "", age: 25, numberOfParticipants: 1 },
          ]),
        reaches: m.registerParticipant,
      },
      exportParticipantsAction: {
        access: STAFF,
        call: () => participantActions.exportParticipantsAction("evt1"),
        reaches: m.getAllParticipants,
      },
    },
  },
  "payment.actions": {
    module: paymentActions,
    rows: {
      // The counter (USER) enrols paying customers through Razorpay.
      createPaymentOrderAction: {
        access: SIGNED_IN,
        call: () => paymentActions.createPaymentOrderAction("evt1", BUYER),
        reaches: m.ordersCreate,
      },
      verifyAndEnrollAction: {
        access: SIGNED_IN,
        call: () => paymentActions.verifyAndEnrollAction(signedPayment("order_1", "pay_1"), "evt1", {}),
        reaches: m.registerParticipant,
      },
    },
  },
  "settings.actions": {
    module: settingsActions,
    rows: {
      updateSettingsAction: {
        access: SUPER_ADMIN_ONLY,
        call: () => settingsActions.updateSettingsAction({ companyName: "Ulsaham Entertainments" }),
        reaches: m.upsertSettings,
      },
      addBrandPartnerAction: {
        access: SUPER_ADMIN_ONLY,
        call: () =>
          settingsActions.addBrandPartnerAction({
            name: "Partner",
            logoUrl: "https://res.cloudinary.com/test-cloud/image/upload/logo.png",
            logoId: "ulsaham/brand-partners/logo",
          }),
        reaches: m.addBrandPartner,
      },
      removeBrandPartnerAction: {
        access: SUPER_ADMIN_ONLY,
        call: () => settingsActions.removeBrandPartnerAction("bp1", "ulsaham/brand-partners/logo"),
        reaches: m.removeBrandPartner,
      },
    },
  },
}

const authMock = auth as unknown as Mock<() => Promise<Session | null>>

function signInAs(role: Role) {
  authMock.mockResolvedValue(
    role === "SIGNED_OUT"
      ? null
      : { user: { id: `id-${role}`, username: role.toLowerCase(), role }, expires: "2099-01-01T00:00:00.000Z" }
  )
}

const REFUSAL = /^(Unauthorized|Forbidden)/

/** "refused" when the action throws or returns Unauthorized/Forbidden. */
async function attempt(row: Row): Promise<"refused" | "passed"> {
  try {
    const result = (await row.call()) as { success?: boolean; error?: string } | undefined
    if (result && result.success === false && REFUSAL.test(result.error ?? "")) return "refused"
    return "passed"
  } catch (error) {
    if (!(error instanceof Error)) throw error
    if (REFUSAL.test(error.message)) return "refused"
    // redirect() after a successful delete or sign-in.
    if (error.message.startsWith("NEXT_REDIRECT")) return "passed"
    throw error
  }
}

const WRITES: Mock[] = [
  m.logActivity,
  m.revalidatePath,
  m.deleteImage,
  m.ordersCreate,
  m.createNewEvent,
  m.updateExistingEvent,
  m.deleteEventWithCleanup,
  m.toggleEventStatus,
  m.registerParticipant,
  m.updateExistingParticipant,
  m.deleteParticipantWithCleanup,
  m.toggleAttendance,
  m.markEntry,
  m.createAdminAccount,
  m.toggleAdminActive,
  m.updateAdminPassword,
  m.deleteAdminAccount,
  m.upsertSettings,
  m.addBrandPartner,
  m.removeBrandPartner,
]

beforeEach(() => {
  vi.clearAllMocks()
  m.findEventById.mockResolvedValue(m.paidEvent)
})

describe("every exported server action has a row", () => {
  for (const [file, { module, rows }] of Object.entries(MATRIX)) {
    it(file, () => {
      const exported = Object.entries(module)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name)
        .sort()
      expect(exported).toEqual(Object.keys(rows).sort())
    })
  }
})

describe("server action role matrix", () => {
  for (const [file, { rows }] of Object.entries(MATRIX)) {
    describe(file, () => {
      for (const [name, row] of Object.entries(rows)) {
        it.each(ROLES)(`${name} as %s`, async (role) => {
          signInAs(role)
          const outcome = await attempt(row)
          if (row.access[role] === "deny") {
            expect(outcome).toBe("refused")
            expect(row.reaches).not.toHaveBeenCalled()
            for (const write of WRITES) expect(write).not.toHaveBeenCalled()
          } else {
            expect(outcome).toBe("passed")
            expect(row.reaches).toHaveBeenCalled()
          }
        })
      }
    })
  }
})

describe("addParticipantAction for counter staff (USER)", () => {
  it("adds to a free event", async () => {
    signInAs("USER")
    m.findEventById.mockResolvedValue({ ...m.paidEvent, isFree: true, amount: null })
    const result = await participantActions.addParticipantAction("evt1", BUYER)
    expect(result).toMatchObject({ success: true })
    expect(m.registerParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt1", amountPaid: true, entryType: "COMPLIMENTARY" })
    )
  })

  it("treats a paid event without a price as free", async () => {
    signInAs("USER")
    m.findEventById.mockResolvedValue({ ...m.paidEvent, amount: null })
    expect(await participantActions.addParticipantAction("evt1", BUYER)).toMatchObject({ success: true })
  })

  it("refuses a paid event: those go through Razorpay", async () => {
    signInAs("USER")
    expect(await participantActions.addParticipantAction("evt1", BUYER)).toEqual({ success: false, error: "Forbidden" })
    expect(m.registerParticipant).not.toHaveBeenCalled()
  })

  it("refuses an event that does not exist", async () => {
    signInAs("USER")
    m.findEventById.mockResolvedValue(null)
    expect(await participantActions.addParticipantAction("evt1", BUYER)).toEqual({ success: false, error: "Forbidden" })
  })
})

describe("verifyAndEnrollAction", () => {
  it("rejects a payment whose signature does not match, before any lookup", async () => {
    signInAs("USER")
    const payment = { ...signedPayment("order_1", "pay_1"), razorpay_signature: "0".repeat(64) }
    const result = await paymentActions.verifyAndEnrollAction(payment, "evt1", {})
    expect(result).toMatchObject({ success: false })
    expect(m.fetchOrderBooking).not.toHaveBeenCalled()
    expect(m.registerParticipant).not.toHaveBeenCalled()
  })

  it("rejects an order that was created for another event", async () => {
    signInAs("ADMIN")
    const result = await paymentActions.verifyAndEnrollAction(signedPayment("order_1", "pay_1"), "evt-other", {})
    expect(result).toMatchObject({ success: false })
    expect(m.registerParticipant).not.toHaveBeenCalled()
  })
})
