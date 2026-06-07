import { NextRequest, NextResponse } from "next/server"
import { paymentOrderRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { participantSchema } from "@/validators/participant.validator"
import { getPublishedEventBySlug } from "@/services/event.service"
import { findParticipantByEventAndPhone, countParticipantsForEvent } from "@/repositories/participant.repository"
import { getRazorpay } from "@/lib/razorpay"
import { calculateTicketFees } from "@/lib/pricing"

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

  const parsed = participantSchema.safeParse(body)
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
    if (event.isFree || !event.amount) {
      return NextResponse.json({ success: false, error: "This is a free event — use the register endpoint" }, { status: 400, headers: corsHeaders })
    }
    if (event.isFull) {
      return NextResponse.json({ success: false, error: "Event is full" }, { status: 410, headers: corsHeaders })
    }

    const existing = await findParticipantByEventAndPhone(event.id, parsed.data.phone)

    // Block only fully-paid registrations; allow re-payment (amountPaid: false)
    if (existing?.amountPaid) {
      return NextResponse.json(
        { success: false, error: "This phone number is already registered for this event" },
        { status: 409, headers: corsHeaders }
      )
    }

    // For new registrations check capacity; re-payments already occupy a slot
    if (!existing && event.capacity !== null) {
      const currentCount = await countParticipantsForEvent(event.id)
      if (currentCount + parsed.data.numberOfParticipants > event.capacity) {
        return NextResponse.json({ success: false, error: "Event is full" }, { status: 410, headers: corsHeaders })
      }
    }

    const quantity = existing ? existing.numberOfParticipants : parsed.data.numberOfParticipants
    const { total } = calculateTicketFees(event.amount, quantity)
    const totalAmountPaise = Math.round(total * 100)

    const keyId = process.env.RAZORPAY_KEY_ID
    if (!keyId) throw new Error("Payment gateway not configured")

    const order = await getRazorpay().orders.create({
      amount: totalAmountPaise,
      currency: "INR",
      receipt: `pub_${event.id.slice(-8)}_${Date.now()}`,
      notes: {
        eventId: event.id,
        eventName: event.name,
        phone: parsed.data.phone,
        name: parsed.data.name,
        email: parsed.data.email ?? "",
        age: String(parsed.data.age),
        numberOfParticipants: String(quantity),
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
          breakdown: calculateTicketFees(event.amount, quantity),
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
