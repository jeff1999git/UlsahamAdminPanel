import Link from "next/link"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { generatePaginationRange } from "@/lib/utils"

interface PaginationProps {
  page: number
  totalPages: number
  baseUrl: string
  searchParams?: Record<string, string>
}

export function Pagination({ page, totalPages, baseUrl, searchParams = {} }: PaginationProps) {
  if (totalPages <= 1) return null

  function getUrl(p: number) {
    const params = new URLSearchParams({ ...searchParams, page: String(p) })
    return `${baseUrl}?${params.toString()}`
  }

  const range = generatePaginationRange(page, totalPages)

  return (
    <div
      className="flex items-center justify-center gap-1 flex-wrap"
      role="navigation"
      aria-label="Pagination"
    >
      <Button variant="outline" size="icon" asChild disabled={page <= 1} className="h-8 w-8">
        <Link href={page > 1 ? getUrl(1) : "#"} aria-label="First page">
          <ChevronsLeft className="h-4 w-4" />
        </Link>
      </Button>
      <Button variant="outline" size="icon" asChild disabled={page <= 1} className="h-8 w-8">
        <Link href={page > 1 ? getUrl(page - 1) : "#"} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </Button>

      {range.map((item, i) =>
        item === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-black text-sm">
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? "default" : "outline"}
            size="icon"
            asChild
            className={cn("h-8 w-8", item === page && "bg-[#014421] text-white")}
          >
            <Link href={getUrl(item as number)} aria-label={`Page ${item}`} aria-current={item === page ? "page" : undefined}>
              {item}
            </Link>
          </Button>
        )
      )}

      <Button variant="outline" size="icon" asChild disabled={page >= totalPages} className="h-8 w-8">
        <Link href={page < totalPages ? getUrl(page + 1) : "#"} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>
      <Button variant="outline" size="icon" asChild disabled={page >= totalPages} className="h-8 w-8">
        <Link href={page < totalPages ? getUrl(totalPages) : "#"} aria-label="Last page">
          <ChevronsRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}

interface TableEmptyProps {
  message?: string
  description?: string
}

export function TableEmpty({
  message = "No records found",
  description = "Try adjusting your search or filters.",
}: TableEmptyProps) {
  return (
    <div className="text-center py-12 text-black">
      <p className="text-base font-medium">{message}</p>
      <p className="text-sm mt-1">{description}</p>
    </div>
  )
}
