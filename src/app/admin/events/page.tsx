import { Suspense } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EventTable } from "@/components/events/event-table"
import { EventsFilter } from "@/components/events/events-filter"
import { Pagination } from "@/components/shared/data-table"
import { TableSkeleton } from "@/components/shared/skeleton-loaders"
import { getEvents } from "@/services/event.service"
import { pruneOldEventParticipants } from "@/repositories/participant.repository"
import type { Metadata } from "next"
import type { EventStatus } from "@prisma/client"

export const metadata: Metadata = { title: "Events" }

interface SearchParams {
  page?: string
  search?: string
  status?: string
}

async function EventsList({ searchParams }: { searchParams: SearchParams }) {
  const page = parseInt(searchParams.page ?? "1")
  const search = searchParams.search ?? ""
  const statusParam = searchParams.status ?? ""
  const status = (statusParam === "all" ? "" : statusParam) as EventStatus | ""

  pruneOldEventParticipants().catch(() => {})

  const { events, total, totalPages } = await getEvents({
    page,
    limit: 10,
    search,
    status,
    sortBy: "createdAt",
    sortOrder: "desc",
  })

  const currentParams: Record<string, string> = {}
  if (search) currentParams.search = search
  if (status) currentParams.status = statusParam

  return (
    <div className="space-y-4">
      <EventTable events={events} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-black">
          {total} event{total !== 1 ? "s" : ""} total
        </p>
        <Pagination
          page={page}
          totalPages={totalPages}
          baseUrl="/admin/events"
          searchParams={currentParams}
        />
      </div>
    </div>
  )
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black">Events</h1>
          <p className="text-sm text-black mt-1">Manage your events</p>
        </div>
        <Button asChild>
          <Link href="/admin/events/new">
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Suspense fallback={<div className="h-10" />}>
        <EventsFilter defaultSearch={params.search} defaultStatus={params.status} />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={5} cols={1} />}>
        <EventsList searchParams={params} />
      </Suspense>
    </div>
  )
}
