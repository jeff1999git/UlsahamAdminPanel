import { NextRequest, NextResponse } from "next/server"
import { getPublishedEventBySlug } from "@/services/event.service"
import { eventDetailRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  const ip = getClientIP(request)
  const { success } = await eventDetailRateLimit.limit(ip)
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
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

    const { _count, bannerImageId, ...publicEvent } = event as typeof event & { _count?: unknown; bannerImageId: string }

    return NextResponse.json(
      { success: true, data: { event: publicEvent } },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("Event detail API error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}
