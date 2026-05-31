import {
  LayoutDashboard,
  CalendarDays,
  UserCog,
  Settings,
  ScrollText,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  superAdminOnly?: boolean
  headerOnly?: boolean
}

export const adminNavItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Events",
    href: "/admin/events",
    icon: CalendarDays,
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
    headerOnly: true,
  },
  {
    label: "Activity Logs",
    href: "/admin/logs",
    icon: ScrollText,
  },
]
