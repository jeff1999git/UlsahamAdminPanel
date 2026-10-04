"use server"

import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { logActivity } from "@/lib/activity-logger"
import {
  createNewEvent,
  updateExistingEvent,
  deleteEventWithCleanup,
  toggleEventStatus,
  getEventById,
} from "@/services/event.service"
import { createEventSchema, updateEventSchema } from "@/validators/event.validator"
import type { ActionResult } from "@/types"
import type { EventStatus, Event } from "@prisma/client"

async function getSession() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return {
    username: (session.user as { username?: string }).username ?? "unknown",
    role: (session.user as { role?: string }).role ?? "ADMIN",
  }
}

export async function createEventAction(
  formData: Record<string, unknown>
): Promise<ActionResult<Event>> {
  const session = await getSession()
  if (session.role !== "SUPER_ADMIN") return { success: false, error: "Forbidden" }

  const parsed = createEventSchema.safeParse(formData)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    const first = (Object.values(errors) as (string[] | undefined)[])[0]?.[0]
    return { success: false, error: first ?? "Validation failed" }
  }

  try {
    const event = await createNewEvent(parsed.data)

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "EVENT_CREATED",
      entity: "Event",
      entityId: event.id,
      description: `Created event: ${event.name}`,
      metadata: { slug: event.slug },
    })

    revalidatePath("/admin/events")
    return { success: true, data: event }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create event"
    return { success: false, error: msg }
  }
}

export async function updateEventAction(
  formData: Record<string, unknown>
): Promise<ActionResult<Event>> {
  const session = await getSession()
  if (session.role !== "SUPER_ADMIN") return { success: false, error: "Forbidden" }

  const parsed = updateEventSchema.safeParse(formData)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    const first = (Object.values(errors) as (string[] | undefined)[])[0]?.[0]
    return { success: false, error: first ?? "Validation failed" }
  }

  const { id, ...rest } = parsed.data

  try {
    const event = await updateExistingEvent(id!, rest)

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "EVENT_UPDATED",
      entity: "Event",
      entityId: event.id,
      description: `Updated event: ${event.name}`,
    })

    revalidatePath("/admin/events")
    revalidatePath(`/admin/events/${id}/edit`)
    return { success: true, data: event }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update event"
    return { success: false, error: msg }
  }
}

/**
 * Deletes an event, or cancels it when it has bookings. A delete redirects to
 * the events list; a cancel returns `{ outcome: "cancelled" }`, so the page
 * can say the event was cancelled, and the browser then goes to the list.
 */
export async function deleteEventAction(id: string): Promise<ActionResult<{ outcome: "cancelled" }>> {
  const session = await getSession()
  if (session.role !== "SUPER_ADMIN") return { success: false, error: "Forbidden" }

  try {
    const existing = await getEventById(id)
    if (!existing) return { success: false, error: "Event not found" }

    const result = await deleteEventWithCleanup(id)

    if (result.outcome === "cancelled") {
      const bookings = `${result.bookings} booking${result.bookings === 1 ? "" : "s"}`
      await logActivity({
        adminUsername: session.username,
        adminRole: session.role,
        action: "EVENT_STATUS_CHANGED",
        entity: "Event",
        entityId: id,
        description: `Cancelled event (${bookings}, so not deleted): ${existing.name}`,
        metadata: { newStatus: "CANCELLED", bookings: result.bookings },
      })

      revalidatePath("/admin/events")
      revalidatePath(`/admin/events/${id}/edit`)
      // The event still exists, so its edit page can render with this result.
      return { success: true, data: { outcome: "cancelled" } }
    }

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "EVENT_DELETED",
      entity: "Event",
      entityId: id,
      description: `Deleted event: ${existing.name}`,
    })

    revalidatePath("/admin/events")
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete event"
    return { success: false, error: msg }
  }

  // Straight to the events list in this same response: returning instead
  // would first re-render the edit page, which is a 404 once the event is
  // gone. redirect() throws, so it stays outside the try.
  redirect("/admin/events")
}

export async function toggleEventStatusAction(
  id: string,
  status: EventStatus
): Promise<ActionResult<Event>> {
  const session = await getSession()
  if (session.role !== "SUPER_ADMIN") return { success: false, error: "Forbidden" }

  try {
    const event = await toggleEventStatus(id, status)

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "EVENT_STATUS_CHANGED",
      entity: "Event",
      entityId: id,
      description: `Changed event status to ${status}: ${event.name}`,
      metadata: { newStatus: status },
    })

    revalidatePath("/admin/events")
    return { success: true, data: event }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update status"
    return { success: false, error: msg }
  }
}
