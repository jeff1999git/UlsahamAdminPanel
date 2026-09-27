export const APP_NAME = "Ulsaham Entertainments"
export const APP_DESCRIPTION = "Event Management Admin Panel"
export const TICKET_CODE_PREFIX = "UE"
export const CLOUDINARY_EVENTS_FOLDER = "ulsaham/events"
export const CLOUDINARY_BRAND_PARTNERS_FOLDER = "ulsaham/brand-partners"
// Uploads pass through a Vercel function, which rejects request bodies over
// 4.5 MB before the route runs, so the limit stays safely below that.
export const MAX_IMAGE_SIZE_MB = 4
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const DEFAULT_PAGE_SIZE = 10
export const LOGS_PAGE_SIZE = 20
export const MAX_PARTICIPANTS_PER_REGISTRATION = 10
// Chest numbers start at COMPETITION_NUMBER_BASE + 1 (i.e. 1001, 1002, ...)
export const COMPETITION_NUMBER_BASE = 1000
export const IST_TIMEZONE = "Asia/Kolkata"

// The customer site serves event and partner data from its edge cache, so a
// saved change reaches it after a short delay. Shown under save toasts.
export const WEBSITE_UPDATE_NOTE_EVENTS = "The website shows this within about a minute (past events: within an hour)."
export const WEBSITE_UPDATE_NOTE_PARTNERS = "The website shows this within an hour."

// Shown when a server action call throws instead of returning a result: the
// connection dropped, the session ended (a refresh then leads to sign-in), or
// the server failed.
export const ACTION_FAILED_MESSAGE =
  "Could not reach the server. Check your connection, refresh the page and try again."

export const EVENT_STATUS_LABELS: Record<string, string> = {
  ANNOUNCED: "Announced",
  PUBLISHED: "Published",
  BOOKING_CLOSED: "Booking Closed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
}

export const LOG_ACTION_LABELS: Record<string, string> = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  EVENT_CREATED: "Event Created",
  EVENT_UPDATED: "Event Updated",
  EVENT_DELETED: "Event Deleted",
  EVENT_STATUS_CHANGED: "Event Status Changed",
  PARTICIPANT_ADDED: "Participant Added",
  PARTICIPANT_UPDATED: "Participant Updated",
  PARTICIPANT_DELETED: "Participant Deleted",
  ATTENDANCE_MARKED: "Attendance Marked",
  ATTENDANCE_UNMARKED: "Attendance Unmarked",
  SETTINGS_UPDATED: "Settings Updated",
  ADMIN_CREATED: "Admin Created",
  ADMIN_UPDATED: "Admin Updated",
  ADMIN_DELETED: "Admin Deleted",
  USER_CREATED: "User Created",
  USER_UPDATED: "User Updated",
  USER_DELETED: "User Deleted",
}

export const LOG_ACTION_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "success" | "warning" | "info" | "muted"
> = {
  LOGIN: "success",
  LOGOUT: "muted",
  EVENT_CREATED: "info",
  EVENT_UPDATED: "info",
  EVENT_DELETED: "destructive",
  EVENT_STATUS_CHANGED: "warning",
  PARTICIPANT_ADDED: "success",
  PARTICIPANT_UPDATED: "info",
  PARTICIPANT_DELETED: "destructive",
  ATTENDANCE_MARKED: "success",
  ATTENDANCE_UNMARKED: "warning",
  SETTINGS_UPDATED: "info",
  ADMIN_CREATED: "info",
  ADMIN_UPDATED: "info",
  ADMIN_DELETED: "destructive",
  USER_CREATED: "info",
  USER_UPDATED: "info",
  USER_DELETED: "destructive",
}

// Activity logs also carry SYSTEM, which the Razorpay webhook writes.
export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  USER: "Counter staff",
  SYSTEM: "System",
}
