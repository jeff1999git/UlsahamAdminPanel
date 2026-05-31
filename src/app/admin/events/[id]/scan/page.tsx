import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { findEventById } from "@/repositories/event.repository"
import { QRScanner } from "@/components/participants/qr-scanner"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const event = await findEventById(id)
  return { title: event ? `Scan: ${event.name}` : "Event Not Found" }
}

export default async function ScanPage({ params }: Props) {
  const { id } = await params
  const event = await findEventById(id)

  if (!event) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/events/${id}/participants`}
          className="inline-flex items-center gap-1 text-sm text-black hover:text-[#014421] mb-2"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Participants
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">QR Scanner</h1>
        <p className="text-black text-sm mt-1">{event.name}</p>
      </div>
      <QRScanner eventId={id} />
    </div>
  )
}
