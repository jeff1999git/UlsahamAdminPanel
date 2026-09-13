import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { myTicketsByUserRateLimit, getClientIP } from "@/lib/ratelimit"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { findTicketCodesByEmail, findTicketCodesByPhone } from "@/repositories/participant.repository"

// The site sends whichever identifier the account has: a 10-digit phone or an email.
const bodySchema = z
  .object({
    email: z.string().email("Invalid email address").optional(),
    phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits").optional(),
  })
  .refine((b) => !!b.email || !!b.phone, { message: "email or phone is required", path: ["email"] })

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  const ip = getClientIP(request)
  const { success: rateLimitOk } = await myTicketsByUserRateLimit.limit(ip)
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
      { success: false, error: parsed.error.flatten().fieldErrors.email?.[0] ?? "Invalid request" },
      { status: 400, headers: corsHeaders }
    )
  }

  try {
    const [byPhone, byEmail] = await Promise.all([
      parsed.data.phone ? findTicketCodesByPhone(parsed.data.phone) : Promise.resolve([]),
      parsed.data.email ? findTicketCodesByEmail(parsed.data.email) : Promise.resolve([]),
    ])
    const ticketCodes = Array.from(new Set([...byPhone, ...byEmail].map((r) => r.ticketCode)))

    return NextResponse.json(
      { success: true, data: { ticketCodes } },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error("My tickets by user error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch tickets" },
      { status: 500, headers: corsHeaders }
    )
  }
}
