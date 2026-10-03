// The public event detail is an allow-list. The bookable object the payment
// routes price from keeps every pricing field, while the JSON the site
// receives never carries codes, Cloudinary ids or internal counters.
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PublicEvent } from "@/types"

const m = vi.hoisted(() => ({
  findPublishedEventBySlug: vi.fn(),
  countParticipantsForEvent: vi.fn(async () => 3),
}))

vi.mock("@/repositories/event.repository", () => ({
  findPublishedEventBySlug: m.findPublishedEventBySlug,
}))
vi.mock("@/repositories/participant.repository", () => ({
  countParticipantsForEvent: m.countParticipantsForEvent,
}))

import { getPublishedEventBySlug, toPublicEvent } from "@/services/event.service"
import { GET } from "@/app/api/public/events/[slug]/route"

const PUBLIC_FIELDS = [
  "id",
  "name",
  "slug",
  "description",
  "bannerImageUrl",
  "galleryImageUrls",
  "venue",
  "venueLink",
  "date",
  "startTime",
  "endTime",
  "status",
  "featured",
  "isFree",
  "amount",
  "earlyBirdAmount",
  "isEarlyBird",
  "effectiveAmount",
  "gstEnabled",
  "platformFeeEnabled",
  "isCompetition",
  "participationType",
  "groupExtraAmount",
  "competitionInstructions",
  "competitionNotes",
  "capacity",
  "registeredCount",
  "isFull",
  "bookingOpen",
  "bookingClosedReason",
  "bookingClosedMessage",
].sort()

const PRIVATE_FIELDS = [
  "couponCodes",
  "complimentaryCodes",
  "lastCompetitionNumber",
  "bannerImageId",
  "galleryImages",
  "_count",
  "archivedParticipantCount",
  "createdAt",
  "updatedAt",
  "participants",
]

/** A full Event row, as findPublishedEventBySlug returns it. */
function eventRow() {
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
    earlyBirdAmount: 400,
    isEarlyBird: true,
    gstEnabled: false,
    platformFeeEnabled: true,
    isCompetition: false,
    participationType: "INDIVIDUAL",
    groupExtraAmount: null,
    competitionInstructions: null,
    competitionNotes: null,
    lastCompetitionNumber: 1042,
    status: "PUBLISHED",
    capacity: 100,
    featured: true,
    couponCodes: [{ code: "SECRET50", discount: 50 }],
    complimentaryCodes: [{ code: "VIPFREE", maxUses: 5, usedCount: 1 }],
    galleryImages: [{ id: "ulsaham/events/g1", url: "https://res.cloudinary.com/test-cloud/image/upload/g1.jpg" }],
    archivedParticipantCount: 0,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-02T00:00:00.000Z"),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-03T10:00:00.000Z"))
  m.findPublishedEventBySlug.mockResolvedValue(eventRow())
})
afterEach(() => {
  vi.useRealTimers()
})

describe("toPublicEvent", () => {
  it("copies only the allow-listed fields, whatever the input carries", () => {
    const polluted = {
      ...eventRow(),
      galleryImageUrls: [],
      effectiveAmount: 400,
      registeredCount: 3,
      isFull: false,
      bookingOpen: true,
      bookingClosedReason: null,
      bookingClosedMessage: null,
      _count: { participants: 3 },
      participants: [{ phone: "9876543210" }],
    } as unknown as PublicEvent

    const output = toPublicEvent(polluted)

    expect(Object.keys(output).sort()).toEqual(PUBLIC_FIELDS)
    for (const field of PRIVATE_FIELDS) expect(output).not.toHaveProperty(field)
  })
})

describe("getPublishedEventBySlug (the bookable event)", () => {
  it("keeps every pricing input the payment routes need and drops the codes", async () => {
    const event = await getPublishedEventBySlug("test-event")

    expect(event).toMatchObject({
      isFree: false,
      amount: 500,
      isEarlyBird: true,
      earlyBirdAmount: 400,
      effectiveAmount: 400,
      gstEnabled: false,
      platformFeeEnabled: true,
      groupExtraAmount: null,
      registeredCount: 3,
      isFull: false,
      bookingOpen: true,
      galleryImageUrls: ["https://res.cloudinary.com/test-cloud/image/upload/g1.jpg"],
    })
    for (const field of ["couponCodes", "complimentaryCodes", "lastCompetitionNumber", "bannerImageId", "galleryImages"]) {
      expect(event).not.toHaveProperty(field)
    }
  })

  it("counts archived seats once the live bookings are gone", async () => {
    m.countParticipantsForEvent.mockResolvedValueOnce(0)
    m.findPublishedEventBySlug.mockResolvedValue({ ...eventRow(), capacity: 40, archivedParticipantCount: 40 })
    const event = await getPublishedEventBySlug("test-event")
    expect(event).toMatchObject({ registeredCount: 40, isFull: true, bookingOpen: false, bookingClosedReason: "FULL" })
  })
})

describe("GET /api/public/events/[slug]", () => {
  it("answers with exactly the public fields", async () => {
    const response = await GET(new NextRequest("http://localhost/api/public/events/test-event"), {
      params: Promise.resolve({ slug: "test-event" }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body.data.event).sort()).toEqual(PUBLIC_FIELDS)
    expect(JSON.stringify(body)).not.toMatch(/SECRET50|VIPFREE|ulsaham\/events\/banner|1042/)
  })

  it("answers 404 for an unknown slug", async () => {
    m.findPublishedEventBySlug.mockResolvedValue(null)
    const response = await GET(new NextRequest("http://localhost/api/public/events/nope"), {
      params: Promise.resolve({ slug: "nope" }),
    })
    expect(response.status).toBe(404)
  })
})
