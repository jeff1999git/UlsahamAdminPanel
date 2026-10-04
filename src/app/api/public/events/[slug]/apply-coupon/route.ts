import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { couponValidateRateLimit, allow, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { getBookableEventBySlug } from "@/services/event.service"
import { validateCoupon } from "@/lib/coupon"

const bodySchema = z.object({
  couponCode: z.string().min(1, "Coupon code is required").max(50),
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
  if (!(await allow(couponValidateRateLimit, ip))) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    )
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.flatten().fieldErrors.couponCode?.[0] ?? "Invalid request" },
      { status: 400, headers: corsHeaders }
    )
  }

  const { slug } = await params

  try {
    const event = await getBookableEventBySlug(slug)
    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found", code: "EVENT_NOT_FOUND" },
        { status: 404, headers: corsHeaders }
      )
    }

    // A code is only worth checking while the event takes bookings.
    if (event.bookingClosedReason) {
      return NextResponse.json(
        { success: false, error: event.bookingClosedMessage },
        { status: 410, headers: corsHeaders }
      )
    }

    if (event.isFree) {
      return NextResponse.json(
        { success: false, error: "Coupon codes are not applicable to free events", code: "COUPON_INVALID" },
        { status: 400, headers: corsHeaders }
      )
    }

    // The same rule payment/order charges by, so an accepted coupon is never
    // refused at payment.
    const coupon = validateCoupon(event, parsed.data.couponCode)
    if (coupon.valid) {
      return NextResponse.json(
        { success: true, data: { type: "coupon", couponCode: coupon.code, discount: coupon.discount } },
        { headers: corsHeaders }
      )
    }
    if (coupon.reason === "NOT_APPLICABLE") {
      return NextResponse.json(
        { success: false, error: "This coupon code is not valid for this event", code: "COUPON_INVALID" },
        { status: 400, headers: corsHeaders }
      )
    }

    const codeInput = parsed.data.couponCode.toUpperCase()
    const complimentary = event.complimentaryCodes.find((c) => c.code.toUpperCase() === codeInput)

    if (complimentary) {
      const remainingUses = complimentary.maxUses - complimentary.usedCount
      if (remainingUses <= 0) {
        return NextResponse.json(
          { success: false, error: "This code has no remaining entries.", code: "COUPON_INVALID" },
          { status: 400, headers: corsHeaders }
        )
      }

      return NextResponse.json(
        { success: true, data: { type: "complimentary", couponCode: complimentary.code, remainingUses } },
        { headers: corsHeaders }
      )
    }

    return NextResponse.json(
      { success: false, error: "Invalid coupon code", code: "COUPON_INVALID" },
      { status: 404, headers: corsHeaders }
    )
  } catch (error) {
    console.error("Apply coupon error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to validate coupon" },
      { status: 500, headers: corsHeaders }
    )
  }
}
