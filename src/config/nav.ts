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
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
  },
  {
    label: "Activity Logs",
    href: "/admin/logs",
    icon: ScrollText,
  },
]
