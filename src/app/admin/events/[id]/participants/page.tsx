import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { findEventById } from "@/repositories/event.repository"
import { getAllParticipantsForEvent } from "@/repositories/participant.repository"
import { ParticipantTable } from "@/components/participants/participant-table"
import { AddParticipantDialog } from "@/components/participants/add-participant-dialog"
import { formatDate } from "@/lib/utils"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const event = await findEventById(id)
  return { title: event ? `Participants: ${event.name}` : "Event Not Found" }
}

export default async function ParticipantsPage({ params }: Props) {
  const { id } = await params

  const [event, participants] = await Promise.all([
    findEventById(id),
    getAllParticipantsForEvent(id),
  ])

  if (!event) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/events"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Events
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Participants</h1>
          <p className="text-muted-foreground text-sm mt-1">{event.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/admin/events/${id}/scan`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent transition-colors"
          >
            QR Scanner
          </Link>
          <AddParticipantDialog eventId={id} />
        </div>
      </div>

      <ParticipantTable
        participants={participants}
        eventId={id}
        totalCount={participants.length}
        eventName={event.name}
        eventDate={formatDate(event.date)}
        eventVenue={event.venue}
      />
    </div>
  )
}
