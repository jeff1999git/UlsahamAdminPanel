import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { paymentOrderRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { participantSchema } from "@/validators/participant.validator"
import { getPublishedEventBySlug, findEventCoupons } from "@/services/event.service"
import { countParticipantsForEvent, findParticipantByTicketCodeOnly } from "@/repositories/participant.repository"
import { getRazorpay } from "@/lib/razorpay"
import { calculateTicketFees, calculateCompetitionFees } from "@/lib/pricing"
import { validateCompetitionQuantity } from "@/lib/competition"
import { hasEventStarted } from "@/lib/event-time"

const orderBodySchema = participantSchema.extend({
  couponCode: z.string().max(50).optional(),
  /** Pay for an existing unpaid ticket instead of creating a new booking. */
  ticketCode: z.string().trim().min(1).max(40).optional(),
})

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  const ip = getClientIP(request)
  const { success: rateLimitOk } = await paymentOrderRateLimit.limit(ip)
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

  const { slug } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    )
  }

  const parsed = orderBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400, headers: corsHeaders }
    )
  }

  try {
    const event = await getPublishedEventBySlug(slug)
    if (!event) {
      return NextResponse.json({ success: false, error: "Event not found" }, { status: 404, headers: corsHeaders })
    }
    if (hasEventStarted(event)) {
      return NextResponse.json(
        { success: false, error: "Booking is closed — this event has already started." },
        { status: 410, headers: corsHeaders }
      )
    }
    if (event.isFree || !event.effectiveAmount) {
      return NextResponse.json({ success: false, error: "This is a free event — use the register endpoint" }, { status: 400, headers: corsHeaders })
    }

    // Re-payment of an existing unpaid ticket: the ticket already occupies
    // capacity and its quantity is authoritative (never trust the client's).
    let repayTicket: Awaited<ReturnType<typeof findParticipantByTicketCodeOnly>> = null
    if (parsed.data.ticketCode) {
      repayTicket = await findParticipantByTicketCodeOnly(parsed.data.ticketCode.toUpperCase())
      if (!repayTicket || repayTicket.eventId !== event.id) {
        return NextResponse.json({ success: false, error: "Ticket not found for this event" }, { status: 404, headers: corsHeaders })
      }
      if (repayTicket.amountPaid) {
        return NextResponse.json({ success: false, error: "This ticket is already paid" }, { status: 409, headers: corsHeaders })
      }
    }

    const quantity = repayTicket ? repayTicket.numberOfParticipants : parsed.data.numberOfParticipants

    if (!repayTicket) {
      if (event.isFull) {
        return NextResponse.json({ success: false, error: "Event is full" }, { status: 410, headers: corsHeaders })
      }

      const quantityError = validateCompetitionQuantity(event, quantity)
      if (quantityError) {
        return NextResponse.json({ success: false, error: quantityError }, { status: 400, headers: corsHeaders })
      }

      if (event.capacity !== null) {
        const currentCount = await countParticipantsForEvent(event.id)
        if (currentCount + quantity > event.capacity) {
          return NextResponse.json({ success: false, error: "Event is full" }, { status: 410, headers: corsHeaders })
        }
      }
    }

    // Resolve coupon discount
    let couponDiscount = 0
    let appliedCouponCode: string | undefined

    if (parsed.data.couponCode) {
      const coupons = await findEventCoupons(event.id)
      const coupon = coupons.find(
        (c) => c.code.toUpperCase() === parsed.data.couponCode!.toUpperCase()
      )
      if (!coupon) {
        return NextResponse.json(
          { success: false, error: "Invalid coupon code" },
          { status: 400, headers: corsHeaders }
        )
      }
      couponDiscount = coupon.discount
      appliedCouponCode = coupon.code
    }

    const breakdown = event.isCompetition
      ? calculateCompetitionFees(event.effectiveAmount, event.groupExtraAmount, quantity, couponDiscount, event.gstEnabled, event.platformFeeEnabled)
      : calculateTicketFees(event.effectiveAmount, quantity, couponDiscount, event.gstEnabled, event.platformFeeEnabled)
    const totalAmountPaise = Math.round(breakdown.total * 100)

    const keyId = process.env.RAZORPAY_KEY_ID
    if (!keyId) throw new Error("Payment gateway not configured")

    const order = await getRazorpay().orders.create({
      amount: totalAmountPaise,
      currency: "INR",
      receipt: `pub_${event.id.slice(-8)}_${Date.now()}`,
      // Notes let the Razorpay webhook finish the booking if the browser
      // never reaches payment/verify. ticketCode marks a re-payment.
      notes: {
        eventId: event.id,
        eventName: event.name,
        phone: repayTicket ? repayTicket.phone : parsed.data.phone,
        name: repayTicket ? repayTicket.name : parsed.data.name,
        email: repayTicket ? (repayTicket.email ?? "") : (parsed.data.email ?? ""),
        age: String(repayTicket ? repayTicket.age : parsed.data.age),
        numberOfParticipants: String(quantity),
        ...(repayTicket ? { ticketCode: repayTicket.ticketCode } : {}),
        ...(appliedCouponCode ? { couponCode: appliedCouponCode, couponDiscount: String(couponDiscount) } : {}),
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          orderId: order.id,
          amount: totalAmountPaise,
          currency: "INR",
          keyId,
          breakdown,
          numberOfParticipants: quantity,
          ...(repayTicket ? { ticketCode: repayTicket.ticketCode } : {}),
        },
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("Public payment order error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create payment order. Please try again." },
      { status: 500, headers: corsHeaders }
    )
  }
}
