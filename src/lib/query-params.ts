/**
 * A positive integer query parameter, clamped to [1, max]. A missing or
 * non-numeric value gives `fallback`, so `?page=abc` reads page 1 instead of
 * reaching the database as NaN and failing with a 500.
 */
export function parsePositiveInt(value: string | null | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}
