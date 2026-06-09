import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { couponValidateRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { getPublishedEventBySlug, findEventCoupons } from "@/services/event.service"

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
  const { success: rateLimitOk } = await couponValidateRateLimit.limit(ip)
  if (!rateLimitOk) {
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
    const event = await getPublishedEventBySlug(slug)
    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404, headers: corsHeaders }
      )
    }

    if (event.isFree) {
      return NextResponse.json(
        { success: false, error: "Coupon codes are not applicable to free events" },
        { status: 400, headers: corsHeaders }
      )
    }

    const coupons = await findEventCoupons(event.id)
    const coupon = coupons.find(
      (c) => c.code.toUpperCase() === parsed.data.couponCode.toUpperCase()
    )

    if (!coupon) {
      return NextResponse.json(
        { success: false, error: "Invalid coupon code" },
        { status: 404, headers: corsHeaders }
      )
    }

    // Discount must be less than the per-person ticket price so the base never reaches zero
    if (coupon.discount >= event.effectiveAmount!) {
      return NextResponse.json(
        { success: false, error: "This coupon code is not valid for this event" },
        { status: 400, headers: corsHeaders }
      )
    }

    return NextResponse.json(
      { success: true, data: { couponCode: coupon.code, discount: coupon.discount } },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("Apply coupon error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to validate coupon" },
      { status: 500, headers: corsHeaders }
    )
  }
}
