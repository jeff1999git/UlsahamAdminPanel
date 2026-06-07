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

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim()
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeString(value)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized as T
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
