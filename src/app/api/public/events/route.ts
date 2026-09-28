import { NextRequest, NextResponse } from "next/server"
import { getPublishedEvents } from "@/services/event.service"
import { eventsListRateLimit, allow, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { parsePositiveInt } from "@/lib/query-params"
import { startServerTiming } from "@/lib/server-timing"

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

function parseFlag(value: string | null): boolean | undefined {
  if (value === "true") return true
  if (value === "false") return false
  return undefined
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)
  const timing = startServerTiming()

  const ip = getClientIP(request)
  if (!(await timing.time("rl", () => allow(eventsListRateLimit, ip)))) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: { ...corsHeaders, ...timing.headers() } }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const page = parsePositiveInt(searchParams.get("page"), 1, 1000)
    const limit = parsePositiveInt(searchParams.get("limit"), 10, 50)
    // featured=false lists only the events that are not featured.
    const featured = parseFlag(searchParams.get("featured"))
    const upcoming = searchParams.get("upcoming") === "true" ? true : undefined
    const past = searchParams.get("past") === "true" ? true : undefined

    const result = await getPublishedEvents({ page, limit, featured, upcoming, past }, timing)
    await timing.ping()

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
      { headers: { ...corsHeaders, ...timing.headers() } }
    )
  } catch (error) {
    console.error("Public events API error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}
