"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"

interface EventsFilterProps {
  defaultSearch?: string
  defaultStatus?: string
}

export function EventsFilter({ defaultSearch, defaultStatus }: EventsFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function navigate(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = (e.currentTarget.elements.namedItem("search") as HTMLInputElement).value.trim()
    navigate("search", value)
  }

  return (
    <div className="flex gap-3 flex-wrap">
      <form onSubmit={handleSearch} className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black" />
        <Input
          name="search"
          placeholder="Search events..."
          defaultValue={defaultSearch}
          className="pl-9"
        />
      </form>

      <NativeSelect
        wrapperClassName="w-[160px]"
        aria-label="Filter by status"
        defaultValue={defaultStatus ?? "all"}
        onChange={(e) => navigate("status", e.target.value)}
      >
        <option value="all">All Statuses</option>
        <option value="ANNOUNCED">Announced</option>
        <option value="PUBLISHED">Published</option>
        <option value="BOOKING_CLOSED">Booking Closed</option>
        <option value="CANCELLED">Cancelled</option>
        <option value="COMPLETED">Completed</option>
      </NativeSelect>
    </div>
  )
}
