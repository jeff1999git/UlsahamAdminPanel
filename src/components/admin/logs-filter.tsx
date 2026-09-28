"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { LOG_ACTION_LABELS } from "@/constants"

interface LogsFilterProps {
  defaultSearch?: string
  defaultAction?: string
}

export function LogsFilter({ defaultSearch, defaultAction }: LogsFilterProps) {
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
    const form = e.currentTarget
    const value = (form.elements.namedItem("search") as HTMLInputElement).value.trim()
    navigate("search", value)
  }

  return (
    <div className="flex gap-3 flex-wrap">
      <form onSubmit={handleSearch} className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black" />
        <Input
          name="search"
          placeholder="Search by admin username..."
          defaultValue={defaultSearch}
          className="pl-9"
        />
      </form>

      <NativeSelect
        wrapperClassName="w-[200px]"
        aria-label="Filter by action"
        defaultValue={defaultAction ?? "all"}
        onChange={(e) => navigate("action", e.target.value)}
      >
        <option value="all">All Actions</option>
        {Object.entries(LOG_ACTION_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}
