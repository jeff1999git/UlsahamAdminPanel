import { NextRequest, NextResponse } from "next/server"
import { getSettings } from "@/repositories/settings.repository"
import { brandPartnersRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  const ip = getClientIP(request)
  const { success } = await brandPartnersRateLimit.limit(ip)
  if (!success) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    )
  }

  try {
    const settings = await getSettings()

    const partners = settings.brandPartners.map(({ id, name, logoUrl }) => ({
      id,
      name,
      logoUrl,
    }))

    return NextResponse.json(
      { success: true, data: { partners } },
      {
        headers: {
          ...corsHeaders,
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
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
