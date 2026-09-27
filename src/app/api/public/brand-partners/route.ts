import { NextRequest, NextResponse } from "next/server"
import { getSettings } from "@/repositories/settings.repository"
import { brandPartnersRateLimit, allow, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { startServerTiming } from "@/lib/server-timing"

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)
  const timing = startServerTiming()

  const ip = getClientIP(request)
  if (!(await timing.time("rl", () => allow(brandPartnersRateLimit, ip)))) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: { ...corsHeaders, ...timing.headers() } }
    )
  }

  try {
    const settings = await timing.time("settings", () => getSettings())

    const partners = settings.brandPartners.map(({ id, name, logoUrl }) => ({
      id,
      name,
      logoUrl,
    }))

    await timing.ping()

    return NextResponse.json(
      { success: true, data: { partners } },
      {
        headers: {
          ...corsHeaders,
          ...timing.headers(),
          // The customer site's edge is the one cache for public reads, so an
          // edit shows there on its schedule instead of stacking a second
          // cache here that nothing can purge.
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    console.error("Brand partners API error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}
