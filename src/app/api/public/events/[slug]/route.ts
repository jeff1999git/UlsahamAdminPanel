import { NextRequest, NextResponse } from "next/server"
import { getPublishedEventBySlug, toPublicEvent } from "@/services/event.service"
import { eventDetailRateLimit, allow, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { startServerTiming } from "@/lib/server-timing"

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)
  const timing = startServerTiming()

  const ip = getClientIP(request)
  if (!(await timing.time("rl", () => allow(eventDetailRateLimit, ip)))) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: { ...corsHeaders, ...timing.headers() } }
    )
  }

  const { slug } = await params

  try {
    const event = await getPublishedEventBySlug(slug, timing)

    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404, headers: corsHeaders }
      )
    }

    await timing.ping()

    return NextResponse.json(
      { success: true, data: { event: toPublicEvent(event) } },
      { headers: { ...corsHeaders, ...timing.headers() } }
    )
  } catch (error) {
    console.error("Event detail API error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}
