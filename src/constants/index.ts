export const APP_NAME = "Ulsaham Entertainments"
export const APP_DESCRIPTION = "Event Management Admin Panel"
export const TICKET_CODE_PREFIX = "UE"
export const CLOUDINARY_EVENTS_FOLDER = "ulsaham/events"
export const CLOUDINARY_BRAND_PARTNERS_FOLDER = "ulsaham/brand-partners"
export const MAX_IMAGE_SIZE_MB = 5
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const DEFAULT_PAGE_SIZE = 10
export const LOGS_PAGE_SIZE = 20
export const MAX_PARTICIPANTS_PER_REGISTRATION = 10
export const IST_TIMEZONE = "Asia/Kolkata"

export const EVENT_STATUS_LABELS: Record<string, string> = {
  ANNOUNCED: "Announced",
  PUBLISHED: "Published",
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
