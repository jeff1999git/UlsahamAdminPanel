/**
 * READ-ONLY report: captured Razorpay payments that have no booking recorded.
 *
 * Before the multi-booking fix, a customer's 2nd/3rd paid booking for the same
 * event was charged by Razorpay but never written as a Participant (the old
 * ticket was returned instead). This script pairs captured payments with
 * bookings so those customers can be issued their tickets from the admin panel.
 *
 * Bookings are deleted two weeks after their event, so a payment for such an
 * event cannot be checked; it is listed as PRUNED (booking archived) rather
 * than UNRECORDED. The pairing itself is in ./lib/payment-pairing.ts.
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
import {
  PRUNED,
  UNRECORDED,
  notesRecord,
  pairPayments,
  paymentsWithoutOrderMatch,
  type RzpPayment,
} from "./lib/payment-pairing"

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

  // 2) Bookings we know about, and every event's date and archived seat count
  //    (to tell the events whose bookings the prune deleted).
  const bookings = await prisma.participant.findMany({
    select: { eventId: true, phone: true, ticketCode: true, amountPaid: true, registeredAt: true, paymentOrderId: true },
  })
  const events = await prisma.event.findMany({
    select: { id: true, name: true, date: true, archivedParticipantCount: true },
  })

  // 3) What each order not claimed by a booking was for, from the notes the
  //    server wrote on it (the payment's own notes are payer-settable).
  const orderNotes = new Map<string, Record<string, string>>()
  for (const pay of paymentsWithoutOrderMatch(payments, bookings)) {
    if (!pay.order_id || orderNotes.has(pay.order_id)) continue
    try {
      const order = (await rzp.orders.fetch(pay.order_id)) as { notes?: unknown }
      orderNotes.set(pay.order_id, notesRecord(order.notes))
    } catch (err) {
      console.warn(`Could not fetch order ${pay.order_id}; using payment ${pay.id}'s own notes.`, err)
    }
  }

  // 4) Pair each payment with a booking; whatever is left over was never recorded.
  const { recorded, rows } = pairPayments({ payments, bookings, events, orderNotes, now: new Date() })
  const unrecorded = rows.filter((row) => row.status === UNRECORDED).length
  const pruned = rows.filter((row) => row.status === PRUNED).length

  console.log(
    `Captured ticket payments in last ${days} days: ${recorded + rows.length} ` +
      `(recorded: ${recorded}, UNRECORDED: ${unrecorded}, for pruned events: ${pruned})`
  )
  if (rows.length) {
    console.table(rows)
  }
  if (unrecorded) {
    console.log(
      "Issue the UNRECORDED bookings via Admin > Event > Participants > Add, quoting the Razorpay payment id. " +
        "Anything added there is recorded as Complimentary, so these will not count towards dashboard revenue."
    )
  }
  if (pruned) {
    console.log(
      `${PRUNED}: the event is over two weeks past and its bookings were deleted, so these cannot be checked here. ` +
        "Their seat and revenue totals are kept on the event."
    )
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
