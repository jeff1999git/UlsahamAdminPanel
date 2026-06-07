"use server"

import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/activity-logger"
import {
  createNewEvent,
  updateExistingEvent,
  deleteEventWithCleanup,
  toggleEventStatus,
  getEvents,
  getEventById,
} from "@/services/event.service"
import { createEventSchema, updateEventSchema } from "@/validators/event.validator"
import type { ActionResult } from "@/types"
import type { EventStatus, Event } from "@prisma/client"
import type { EventListParams } from "@/types/event.types"

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
  if (session.role === "USER") return { success: false, error: "Forbidden" }

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
  if (session.role === "USER") return { success: false, error: "Forbidden" }

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

export async function deleteEventAction(id: string): Promise<ActionResult<void>> {
  const session = await getSession()
  if (session.role === "USER") return { success: false, error: "Forbidden" }

  try {
    const existing = await getEventById(id)
    if (!existing) return { success: false, error: "Event not found" }

    await deleteEventWithCleanup(id)

    await logActivity({
      adminUsername: session.username,
      adminRole: session.role,
      action: "EVENT_DELETED",
      entity: "Event",
      entityId: id,
      description: `Deleted event: ${existing.name}`,
    })

    revalidatePath("/admin/events")
    return { success: true, data: undefined }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete event"
    return { success: false, error: msg }
  }
}

export async function toggleEventStatusAction(
  id: string,
  status: EventStatus
): Promise<ActionResult<Event>> {
  const session = await getSession()
  if (session.role === "USER") return { success: false, error: "Forbidden" }

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

export async function getEventsAction(params: EventListParams) {
  return getEvents(params)
}
