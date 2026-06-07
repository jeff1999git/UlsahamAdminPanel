import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { getCorsHeaders, corsOptionsResponse } from "@/lib/cors"
import { participantSchema } from "@/validators/participant.validator"
import { getPublishedEventBySlug } from "@/services/event.service"
import { findParticipantByEventAndPhone, updateParticipant } from "@/repositories/participant.repository"
import { registerParticipant } from "@/services/participant.service"
import { z } from "zod"

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\d{10}$/),
  email: z.string().email().optional().nullable().or(z.literal("")),
  age: z.coerce.number().int().min(1).max(120),
  numberOfParticipants: z.coerce.number().int().min(1).max(10),
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

  const parsed = verifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request data" },
      { status: 400, headers: corsHeaders }
    )
  }

  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "Payment configuration error" },
      { status: 500, headers: corsHeaders }
    )
  }

  // HMAC-SHA256 signature verification
  const sigBody = `${parsed.data.razorpay_order_id}|${parsed.data.razorpay_payment_id}`
  const expected = crypto.createHmac("sha256", secret).update(sigBody).digest("hex")
  if (expected !== parsed.data.razorpay_signature) {
    return NextResponse.json(
      { success: false, error: "Payment verification failed. Please contact support." },
      { status: 400, headers: corsHeaders }
    )
  }

  try {
    const event = await getPublishedEventBySlug(slug)
    if (!event) {
      return NextResponse.json({ success: false, error: "Event not found" }, { status: 404, headers: corsHeaders })
    }

    const { razorpay_payment_id, razorpay_order_id, name, phone, email, age, numberOfParticipants } = parsed.data

    const existing = await findParticipantByEventAndPhone(event.id, phone)

    if (existing) {
      // Re-payment or webhook race — mark paid and return ticket info
      const updated = !existing.amountPaid
        ? await updateParticipant(existing.id, { amountPaid: true })
        : existing

      return NextResponse.json(
        {
          success: true,
          message: "Payment verified and registration confirmed!",
          data: {
            ticketCode: updated.ticketCode,
            qrCodeUrl: updated.qrCodeUrl,
            participantName: updated.name,
            eventName: event.name,
            eventDate: event.date,
            eventVenue: event.venue,
            numberOfParticipants: updated.numberOfParticipants,
            paymentId: razorpay_payment_id,
          },
        },
        { status: 200, headers: corsHeaders }
      )
    }

    // New registration
    const { participant } = await registerParticipant({
      eventId: event.id,
      name,
      phone,
      email: email || null,
      age,
      numberOfParticipants,
      amountPaid: true,
    })

    return NextResponse.json(
      {
        success: true,
        message: "Payment verified and registration confirmed!",
        data: {
          ticketCode: participant.ticketCode,
          qrCodeUrl: participant.qrCodeUrl,
          participantName: participant.name,
          eventName: event.name,
          eventDate: event.date,
          eventVenue: event.venue,
          numberOfParticipants: participant.numberOfParticipants,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
        },
      },
      { status: 201, headers: corsHeaders }
    )
  } catch (error) {
    console.error("Public payment verify error:", error)
    return NextResponse.json(
      { success: false, error: "Registration failed. Please contact support with your payment ID." },
      { status: 500, headers: corsHeaders }
    )
  }
}
