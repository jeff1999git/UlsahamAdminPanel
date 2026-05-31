import { notFound } from "next/navigation"
import { findEventById } from "@/repositories/event.repository"
import { EventForm } from "@/components/events/event-form"
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
  const { id } = await params
  const event = await findEventById(id)

  if (!event) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit Event</h1>
        <p className="text-black text-sm mt-1">{event.name}</p>
      </div>
      <EventForm event={event} />
    </div>
  )
}
