import { redirect, notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { findEventById } from "@/repositories/event.repository"
import { EventForm } from "@/components/events/event-form"
import { EventEditActions } from "@/components/events/event-edit-actions"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const event = await findEventById(id)
  return { title: event ? `Edit: ${event.name}` : "Event Not Found" }
}

export default async function EditEventPage({ params }: Props) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "SUPER_ADMIN") redirect("/admin/events")

  const { id } = await params
  const event = await findEventById(id)
  if (!event) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Event</h1>
          <p className="text-black text-sm mt-1">{event.name}</p>
        </div>
        <EventEditActions
          eventId={event.id}
          status={event.status}
          participantCount={event._count.participants}
        />
      </div>
      <EventForm event={event} />
    </div>
  )
}
