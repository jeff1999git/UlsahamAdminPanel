import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const IST_TIMEZONE = "Asia/Kolkata"

// en-IN uses locale-dependent separators (hyphens in Node, spaces in browsers).
// Use formatToParts with a neutral locale to build consistent strings manually.
const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const partsTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
})

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(d).map((p) => [p.type, p.value])
  )
  return `${parts.day} ${parts.month} ${parts.year}`
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const parts = Object.fromEntries(
    partsTimeFormatter.formatToParts(d).map((p) => [p.type, p.value])
  )
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`
}

const amountFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Rupee amount with Indian digit grouping and no ₹ sign; render the sign with <Rupee />. */
export function formatAmount(amount: number): string {
  return amountFormatter.format(amount)
}

/**
 * True when a lazily loaded chunk (import()) could not be fetched: the device is
 * offline, or the tab was opened before a deploy and its chunk no longer exists.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === "ChunkLoadError" ||
    /loading (css )?chunk|dynamically imported module|importing a module script failed/i.test(error.message)
  )
}

export function generatePaginationRange(
  currentPage: number,
  totalPages: number
): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "...", totalPages]
  }

  if (currentPage >= totalPages - 2) {
    return [1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages]
}
