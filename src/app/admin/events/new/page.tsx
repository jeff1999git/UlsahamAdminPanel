import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EventForm } from "@/components/events/event-form"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "New Event" }

export default function NewEventPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/events" aria-label="Back to events">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Event</h1>
          <p className="text-sm text-gray-500">Fill in the details to create a new event</p>
        </div>
      </div>
      <EventForm />
    </div>
  )
}
