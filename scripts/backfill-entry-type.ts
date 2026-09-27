/**
 * One-off: settle bookings left unpaid by the old "Paid" tick box.
 *
 * The tick box was replaced by a read-only Entry Type, and anything staff add
 * in the admin panel is now complimentary. Bookings created before that — staff
 * adds nobody ticked, and site registrations from before 28 July 2026 — are
 * still stored unpaid, and nothing in the admin panel can settle them any more.
 * This settles every unpaid booking that never went through Razorpay:
 *   free event -> Free
 *   paid event -> Complimentary
 * Bookings with a Razorpay order or payment id are left alone.
 *
 * Usage (from the repo root, uses .env.local):
 *   npx tsx scripts/backfill-entry-type.ts                      # dry run: lists what would change
 *   npx tsx scripts/backfill-entry-type.ts --free-only          # dry run, free events only
 *   npx tsx scripts/backfill-entry-type.ts --apply              # writes
 *   npx tsx scripts/backfill-entry-type.ts --free-only --apply  # writes, free events only
 *
 * Without --apply it never writes. Review the list first: on a paid event, an
 * unpaid staff-added booking may be someone who has not paid yet.
 */
import { readFileSync } from "fs"
import { resolve } from "path"
import { PrismaClient, type EntryType } from "@prisma/client"

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

async function main() {
  const apply = process.argv.includes("--apply")
  const freeOnly = process.argv.includes("--free-only")
  const prisma = new PrismaClient()

  // Filtered here rather than in the query: on MongoDB a null filter and a
  // missing field are not the same thing.
  const participants = await prisma.participant.findMany({
    select: {
      id: true, eventId: true, name: true, phone: true, ticketCode: true,
      registeredAt: true, amountPaid: true, paymentOrderId: true, paymentId: true,
    },
  })
  const events = await prisma.event.findMany({ select: { id: true, name: true, isFree: true, amount: true } })
  const eventById = new Map(events.map((e) => [e.id, e]))

  const changes: Array<{ id: string; entryType: EntryType; row: Record<string, string> }> = []
  for (const p of participants) {
    if (p.amountPaid || p.paymentOrderId || p.paymentId) continue
    const event = eventById.get(p.eventId)
    if (!event) continue
    const isFree = event.isFree || !event.amount
    if (freeOnly && !isFree) continue
    const entryType: EntryType = isFree ? "FREE" : "COMPLIMENTARY"
    changes.push({
      id: p.id,
      entryType,
      row: {
        event: event.name,
        name: p.name,
        phone: p.phone,
        ticketCode: p.ticketCode,
        registered: p.registeredAt.toISOString().slice(0, 10),
        becomes: entryType === "FREE" ? "Free" : "Complimentary",
      },
    })
  }

  console.log(`Unpaid bookings with no Razorpay payment${freeOnly ? " (free events only)" : ""}: ${changes.length}`)
  if (changes.length) console.table(changes.map((c) => c.row))

  if (!apply) {
    if (changes.length) console.log("Dry run: nothing was written. Re-run with --apply to settle these bookings.")
    await prisma.$disconnect()
    return
  }

  for (const entryType of ["FREE", "COMPLIMENTARY"] as const) {
    const ids = changes.filter((c) => c.entryType === entryType).map((c) => c.id)
    if (!ids.length) continue
    // amountPaid: false in the filter keeps a re-run, or a booking paid in the
    // meantime, from being overwritten.
    const { count } = await prisma.participant.updateMany({
      where: { id: { in: ids }, amountPaid: false },
      data: { amountPaid: true, entryType },
    })
    console.log(`Settled ${count} booking(s) as ${entryType === "FREE" ? "Free" : "Complimentary"}.`)
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
