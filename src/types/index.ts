export type * from "./auth.types"
export type * from "./event.types"
export type * from "./participant.types"

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export type PaginatedResult<T> = {
  data: T[]
  total: number
  page: number
  totalPages: number
}

export type DashboardStats = {
  totalEvents: number
  publishedEvents: number
  upcomingEvents: number
  totalParticipants: number
  totalRevenue: number
}
