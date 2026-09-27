// Dependency-free on purpose: the public API routes import this through the
// event and participant services, so it must not pull tailwind-merge (utils.ts)
// into their cold start.

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
