import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EventForm } from "@/components/events/event-form"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "New Event" }

export default async function NewEventPage() {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "SUPER_ADMIN") redirect("/admin/events")

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/events" aria-label="Back to events">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-black">Create Event</h1>
          <p className="text-sm text-black">Fill in the details to create a new event</p>
        </div>
      </div>
      <EventForm />
    </div>
  )
}
