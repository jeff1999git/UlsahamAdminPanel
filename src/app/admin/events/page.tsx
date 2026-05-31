import { Suspense } from "react"
import Link from "next/link"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EventTable } from "@/components/events/event-table"
import { Pagination } from "@/components/shared/data-table"
import { TableSkeleton } from "@/components/shared/skeleton-loaders"
import { getEvents } from "@/services/event.service"
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
      <form method="GET" className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black" />
          <Input
            name="search"
            placeholder="Search events..."
            defaultValue={params.search}
            className="pl-9"
          />
        </div>
        <Select name="status" defaultValue={params.status ?? "all"}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <Suspense fallback={<TableSkeleton rows={5} cols={6} />}>
        <EventsList searchParams={params} />
      </Suspense>
    </div>
  )
}
