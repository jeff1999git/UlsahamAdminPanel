import { NextRequest, NextResponse } from "next/server"
import { getPublishedEvents } from "@/services/event.service"
import { eventsListRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  const ip = getClientIP(request)
  const { success } = await eventsListRateLimit.limit(ip)
  if (!success) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.min(Math.max(parseInt(searchParams.get("page") ?? "1"), 1), 1000)
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "10"), 1), 50)
    const featured = searchParams.get("featured") === "true" ? true : undefined
    const upcoming = searchParams.get("upcoming") === "true" ? true : undefined
    const past = searchParams.get("past") === "true" ? true : undefined

    const result = await getPublishedEvents({ page, limit, featured, upcoming, past })

    return NextResponse.json(
      {
        success: true,
        data: {
          events: result.events,
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        },
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("Public events API error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}
