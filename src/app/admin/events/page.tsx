import { auth } from "@/lib/auth"
import { Suspense } from "react"
import { after } from "next/server"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EventTable } from "@/components/events/event-table"
import { EventsFilter } from "@/components/events/events-filter"
import { Pagination } from "@/components/shared/data-table"
import { TableSkeleton } from "@/components/shared/skeleton-loaders"
import { getEvents } from "@/services/event.service"
import { runEventsHousekeeping } from "@/services/housekeeping.service"
import { runThrottled } from "@/lib/ratelimit"
import { parsePositiveInt } from "@/lib/query-params"
import { EVENT_STATUS_LABELS } from "@/constants"
import type { Metadata } from "next"
import type { EventStatus } from "@prisma/client"
import type { AdminEventListItem } from "@/types/event.types"

export const metadata: Metadata = { title: "Events" }

interface SearchParams {
  page?: string
  search?: string
  status?: string
}

async function EventsList({ searchParams, isUser, isSuperAdmin }: { searchParams: SearchParams; isUser: boolean; isSuperAdmin: boolean }) {
  // Hand-edited URLs: a non-numeric page reads page 1, and an unknown status
  // lists every status, instead of either reaching Prisma and failing.
  const page = parsePositiveInt(searchParams.page, 1, 1000)
  const search = searchParams.search ?? ""
  const statusParam = searchParams.status ?? ""
  const status = Object.keys(EVENT_STATUS_LABELS).includes(statusParam)
    ? (statusParam as EventStatus)
    : ""

  // Housekeeping after the page is sent, at most once an hour across instances:
  // old bookings are pruned and images no longer used are deleted.
  after(() => runThrottled("events-housekeeping", 60 * 60, runEventsHousekeeping))

  const { events, total, totalPages } = await getEvents({
    page,
    limit: 10,
    search,
    status,
    sortBy: "createdAt",
    sortOrder: "desc",
  })

  // USER accounts are never shown seat counts, so they are not sent to them either.
  const rows: AdminEventListItem[] = isUser
    ? events.map(({ registeredCount, capacity, ...event }) => event)
    : events

  const currentParams: Record<string, string> = {}
  if (search) currentParams.search = search
  if (status) currentParams.status = statusParam

  return (
    <div className="space-y-4">
      <EventTable events={rows} isUser={isUser} isSuperAdmin={isSuperAdmin} />
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
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  const isUser = role === "USER"
  const isSuperAdmin = role === "SUPER_ADMIN"
  const params = await searchParams

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black">Events</h1>
          <p className="text-sm text-black mt-1">Manage your events</p>
        </div>
        {isSuperAdmin && (
          <Button asChild>
            <Link href="/admin/events/new">
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Link>
          </Button>
        )}
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <EventsFilter defaultSearch={params.search} defaultStatus={params.status} />
      </Suspense>

      {/* Keyed by the query, so a new filter or page shows the skeleton
          instead of leaving the old list on screen while it loads. */}
      <Suspense key={JSON.stringify(params)} fallback={<TableSkeleton rows={5} cols={1} toolbar={false} />}>
        <EventsList searchParams={params} isUser={isUser} isSuperAdmin={isSuperAdmin} />
      </Suspense>
    </div>
  )
}
