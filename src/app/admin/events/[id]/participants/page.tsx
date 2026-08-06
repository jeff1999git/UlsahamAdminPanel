import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { findEventById } from "@/repositories/event.repository"
import { getAllParticipantsForEvent } from "@/repositories/participant.repository"
import { ParticipantTable } from "@/components/participants/participant-table"
import { AddParticipantDialog } from "@/components/participants/add-participant-dialog"
import { ImportParticipantsDialog } from "@/components/participants/import-participants-dialog"
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
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (role === "USER") redirect("/admin/events")

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
            className="inline-flex items-center gap-1 text-sm text-black hover:text-[#014421] mb-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Events
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Participants</h1>
          <p className="text-black text-sm mt-1">{event.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {role === "SUPER_ADMIN" && <ImportParticipantsDialog eventId={id} />}
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
        eventBannerUrl={event.bannerImageUrl}
        competitionInstructions={event.competitionInstructions}
        competitionNotes={event.competitionNotes}
        isSuperAdmin={role === "SUPER_ADMIN"}
      />
    </div>
  )
}
