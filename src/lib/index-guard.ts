import { prisma } from "@/lib/prisma"
import { findParticipantByEventAndPhone } from "@/repositories/participant.repository"

// A guard against unique indexes the schema no longer declares. Participant
// once allowed one booking per phone per event (Participant_eventId_phone_key).
// `prisma db push` drops such an index, but a database that missed it takes
// the payment and then refuses to write the booking, as happened in
// production in October 2026. The booking routes ask here before taking money.

/** How long one listIndexes answer is trusted on this instance. */
const CHECK_TTL_MS = 10 * 60_000
/** A failed check is retried sooner, so one blip does not switch the guard off for ten minutes. */
const FAILED_CHECK_TTL_MS = 60_000
/**
 * Every booking on the instance waits for the shared answer, so a check still
 * unanswered after this long counts as failed instead of holding them up.
 */
const CHECK_TIMEOUT_MS = 3000

/** Settles as `work` does, or rejects once `ms` have passed. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`listIndexes did not answer within ${ms} ms`)), ms)
  })
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer))
}

/** Unique indexes the schema declares: _id (implicitly unique) and ticketCode. */
function isDeclaredUnique(key: unknown): boolean {
  if (!key || typeof key !== "object") return false
  const fields = Object.keys(key)
  return fields.length === 1 && (fields[0] === "_id" || fields[0] === "ticketCode")
}

/** Names of the unique indexes in a listIndexes reply other than _id and ticketCode. */
export function legacyUniqueIndexNames(reply: unknown): string[] {
  const indexes = (reply as { cursor?: { firstBatch?: unknown } } | null)?.cursor?.firstBatch
  if (!Array.isArray(indexes)) throw new Error("Unexpected listIndexes reply")
  return indexes
    .filter((index): index is { name?: unknown; key?: unknown; unique?: unknown } => !!index && typeof index === "object")
    .filter((index) => index.unique === true && !isDeclaredUnique(index.key))
    .map((index) => (typeof index.name === "string" ? index.name : JSON.stringify(index.key)))
}

/**
 * The cached check: `listIndexes` runs at most once per CHECK_TTL_MS (requests
 * arriving meanwhile share its answer). A check that fails or does not answer
 * within CHECK_TIMEOUT_MS is logged and counts as "no legacy index". Exported
 * with the lookup and clock injectable for tests.
 */
export function createIndexGuard(listIndexes: () => Promise<unknown>, now: () => number = Date.now) {
  let cached: { names: Promise<string[]>; expiresAt: number } | null = null
  return function legacyUniqueIndexes(): Promise<string[]> {
    if (cached && now() < cached.expiresAt) return cached.names
    const entry = { names: Promise.resolve<string[]>([]), expiresAt: now() + CHECK_TTL_MS }
    entry.names = (async () => legacyUniqueIndexNames(await withDeadline(listIndexes(), CHECK_TIMEOUT_MS)))().catch((error: unknown) => {
      console.error("[index-guard] Could not list the Participant indexes; the legacy-index guard is off until the next check:", error)
      entry.expiresAt = now() + FAILED_CHECK_TTL_MS
      return []
    })
    cached = entry
    return entry.names
  }
}

const legacyUniqueIndexes = createIndexGuard(() => prisma.$runCommandRaw({ listIndexes: "Participant" }))

/**
 * Logs loudly when Participant carries a unique index the schema does not
 * declare, and says whether it does. The booking routes call it on every
 * request, so the log repeats until the index is dropped.
 */
export async function warnIfLegacyUniqueIndexes(): Promise<boolean> {
  const names = await legacyUniqueIndexes()
  if (names.length === 0) return false
  console.error(
    `[index-guard] LEGACY UNIQUE INDEX on Participant: ${names.join(", ")}. ` +
      "A second booking that repeats a phone or email fails, after the payment for a paid event. " +
      "Drop it: run `npx prisma db push` against this database, or drop it in Atlas (Indexes tab)."
  )
  return true
}

/**
 * True when a legacy unique index is present and this phone already holds a
 * booking for the event, so a new paid booking would be refused after the
 * money is taken. payment/order turns such a booking down before creating an
 * order.
 */
export async function legacyIndexBlocksPhone(eventId: string, phone: string): Promise<boolean> {
  if (!(await warnIfLegacyUniqueIndexes())) return false
  return (await findParticipantByEventAndPhone(eventId, phone)) !== null
}
