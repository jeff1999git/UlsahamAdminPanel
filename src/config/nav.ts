import {
  LayoutDashboard,
  CalendarDays,
  UserCog,
  Settings,
  ScrollText,
  QrCode,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  superAdminOnly?: boolean
  adminOnly?: boolean
  headerOnly?: boolean
}

export const adminNavItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    adminOnly: true,
  },
  {
    label: "Events",
    href: "/admin/events",
    icon: CalendarDays,
  },
  {
    label: "QR Scanner",
    href: "/admin/scan",
    icon: QrCode,
    adminOnly: true,
  },
  {
    label: "Admin Accounts",
    href: "/admin/admins",
    icon: UserCog,
    superAdminOnly: true,
    headerOnly: true,
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    adminOnly: true,
    headerOnly: true,
  },
  {
    label: "Activity Logs",
    href: "/admin/logs",
    icon: ScrollText,
    adminOnly: true,
  },
]
