/**
 * READ-ONLY report: captured Razorpay payments that have no booking recorded.
 *
 * Before the multi-booking fix, a customer's 2nd/3rd paid booking for the same
 * event was charged by Razorpay but never written as a Participant (the old
 * ticket was returned instead). This script pairs captured payments with
 * bookings so those customers can be issued their tickets from the admin panel.
 *
 * Usage (from the repo root, uses .env.local):
 *   npx tsx scripts/report-unrecorded-payments.ts [--days 90]
 *
 * It never writes to the database or to Razorpay.
 */
import { readFileSync } from "fs"
import { resolve } from "path"
import { PrismaClient } from "@prisma/client"
import Razorpay from "razorpay"

// Minimal .env.local loader (Node 20.11 has no process.loadEnvFile).
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m || process.env[m[1]] !== undefined) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
} catch {
  /* rely on the ambient environment */
}

type RzpPayment = {
  id: string
  order_id?: string | null
  status: string
  amount: number
  created_at: number
  email?: string
  contact?: string
  notes?: Record<string, string>
}

const PAIRING_WINDOW_MS = 30 * 60 * 1000 // booking written within 30 min of payment

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function main() {
  const days = Number(arg("days", "90"))
  const key_id = process.env.RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET
  if (!key_id || !key_secret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set")

  const rzp = new Razorpay({ key_id, key_secret })
  const prisma = new PrismaClient()

  const to = Math.floor(Date.now() / 1000)
  const from = to - days * 86400

  // 1) Every captured payment in the window.
  const payments: RzpPayment[] = []
  for (let skip = 0; ; skip += 100) {
    const page = (await rzp.payments.all({ from, to, count: 100, skip })) as { items: RzpPayment[] }
    payments.push(...page.items.filter((p) => p.status === "captured"))
    if (page.items.length < 100) break
  }
  payments.sort((a, b) => a.created_at - b.created_at)

  // 2) Bookings we know about.
  const participants = await prisma.participant.findMany({
    select: {
      id: true, eventId: true, phone: true, name: true, ticketCode: true, amountPaid: true,
      numberOfParticipants: true, registeredAt: true, paymentOrderId: true, paymentId: true,
    },
  })
  const events = await prisma.event.findMany({ select: { id: true, name: true } })
  const eventName = new Map(events.map((e) => [e.id, e.name]))

  const byOrder = new Map(participants.filter((p) => p.paymentOrderId).map((p) => [p.paymentOrderId!, p]))
  const byTicket = new Map(participants.map((p) => [p.ticketCode, p]))
  const legacyPool = new Map<string, typeof participants>() // eventId|phone -> unclaimed bookings
  for (const p of participants) {
    if (p.paymentOrderId) continue
    const k = `${p.eventId}|${p.phone}`
    legacyPool.set(k, [...(legacyPool.get(k) ?? []), p])
  }
  for (const list of legacyPool.values()) list.sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime())

  // 3) Pair each payment with a booking; whatever is left over was never recorded.
  const unrecorded: Array<Record<string, string | number>> = []
  let recorded = 0
  for (const pay of payments) {
    const notes = pay.notes ?? {}
    const eventId = notes.eventId
    const phone = notes.phone
    if (!eventId || !phone) continue // not a ticket payment

    if (pay.order_id && byOrder.has(pay.order_id)) { recorded++; continue }
    if (notes.ticketCode && byTicket.get(notes.ticketCode)?.amountPaid) { recorded++; continue }

    // Legacy pairing: the booking written closest after this payment for the same event+phone.
    const pool = legacyPool.get(`${eventId}|${phone}`) ?? []
    const payAt = pay.created_at * 1000
    const idx = pool.findIndex((p) => Math.abs(p.registeredAt.getTime() - payAt) <= PAIRING_WINDOW_MS)
    if (idx >= 0) { pool.splice(idx, 1); recorded++; continue }

    unrecorded.push({
      paymentId: pay.id,
      orderId: pay.order_id ?? "",
      paidAt: new Date(payAt).toISOString(),
      amountINR: (pay.amount / 100).toFixed(2),
      event: eventName.get(eventId) ?? eventId,
      name: notes.name ?? "",
      phone,
      email: notes.email ?? "",
      quantity: notes.numberOfParticipants ?? "1",
    })
  }

  console.log(`Captured ticket payments in last ${days} days: ${recorded + unrecorded.length} (recorded: ${recorded}, UNRECORDED: ${unrecorded.length})`)
  if (unrecorded.length) {
    console.table(unrecorded)
    console.log("Issue these bookings via Admin > Event > Participants > Add (mark paid), quoting the Razorpay payment id.")
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
