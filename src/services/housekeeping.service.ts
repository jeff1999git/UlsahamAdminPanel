import { pruneOldEventParticipants } from "@/repositories/participant.repository"
import { findEventImagesAmong } from "@/repositories/event.repository"
import {
  findImageDeleteQueue,
  queueImageDeletes,
  removeQueuedImageDeletes,
} from "@/repositories/settings.repository"

/**
 * How long an image an event or a brand partner let go of is kept before it
 * is deleted: longer than the website's edge cache and Cloudinary's CDN keep a
 * page or a list that still shows it.
 */
export const IMAGE_DELETE_DELAY_MS = 2 * 60 * 60 * 1000
/** Images deleted per run, so one run stays short. */
const IMAGE_DELETES_PER_RUN = 25
/** A deletion still failing this long after it fell due is dropped, with a log line. */
const IMAGE_DELETE_GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Queues Cloudinary images for deletion once IMAGE_DELETE_DELAY_MS has passed.
 * Callers queue an image only after the database write that let go of it has
 * succeeded. Never throws: that write has already happened, so a failure here
 * is logged and the image simply stays in Cloudinary.
 */
export async function scheduleImageDeletes(
  publicIds: Array<string | null | undefined>,
  now: Date = new Date()
): Promise<void> {
  const ids = [...new Set(publicIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return
  const deleteAfter = new Date(now.getTime() + IMAGE_DELETE_DELAY_MS)
  try {
    await queueImageDeletes(ids.map((publicId) => ({ publicId, deleteAfter })))
  } catch (error) {
    console.error(`Could not queue ${ids.length} image(s) for deletion; they stay in Cloudinary:`, ids, error)
  }
}

/**
 * Deletes the queued images that are due, purging Cloudinary's CDN copies too,
 * and takes them off the queue. An image an event or a brand partner uses
 * again is kept, and comes off the queue as well. A deletion that fails stays
 * queued for the next run, until it is a week overdue.
 */
export async function deleteDueImages(now: Date = new Date()): Promise<void> {
  const { pending, partnerLogoIds } = await findImageDeleteQueue()

  // Oldest first; an image queued twice is deleted once.
  const dueSince = new Map<string, number>()
  for (const entry of [...pending].sort((a, b) => a.deleteAfter.getTime() - b.deleteAfter.getTime())) {
    if (entry.deleteAfter.getTime() <= now.getTime() && !dueSince.has(entry.publicId)) {
      dueSince.set(entry.publicId, entry.deleteAfter.getTime())
    }
  }
  const ids = [...dueSince.keys()].slice(0, IMAGE_DELETES_PER_RUN)
  if (ids.length === 0) return

  const inUse = new Set([...partnerLogoIds, ...(await findEventImagesAmong(ids))])
  // Cloudinary (and its lodash) loads only when there is something to delete.
  const { deleteImage } = await import("@/lib/cloudinary")

  const settled: string[] = []
  await Promise.all(
    ids.map(async (publicId) => {
      if (inUse.has(publicId) || (await deleteImage(publicId))) {
        settled.push(publicId)
      } else if (now.getTime() - dueSince.get(publicId)! > IMAGE_DELETE_GIVE_UP_MS) {
        console.error(`Gave up deleting Cloudinary image ${publicId}: it has failed for a week.`)
        settled.push(publicId)
      }
    })
  )

  // Only the entries that were due come off: the same image queued again
  // since (released anew) keeps its later entry.
  if (settled.length > 0) await removeQueuedImageDeletes(settled, now)
}

/**
 * The events page's housekeeping, which runThrottled starts at most once an
 * hour: bookings of events more than two weeks past are pruned, then the
 * images whose time has come are deleted. Each task runs even when the other
 * fails, and a failure is logged.
 */
export async function runEventsHousekeeping(): Promise<void> {
  const tasks: Array<[name: string, task: () => Promise<unknown>]> = [
    ["prune-event-participants", pruneOldEventParticipants],
    ["delete-due-images", deleteDueImages],
  ]
  for (const [name, task] of tasks) {
    try {
      await task()
    } catch (error) {
      console.error(`${name} failed:`, error)
    }
  }
}
