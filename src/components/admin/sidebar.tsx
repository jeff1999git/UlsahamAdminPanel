"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { adminNavItems } from "@/config/nav"
import { logoutAction } from "@/actions/auth.actions"

interface SidebarProps {
  username: string
  role: string
}

export function Sidebar({ username, role }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="hidden lg:flex flex-col w-64 min-h-screen bg-[#014421] text-white fixed left-0 top-0 z-40"
      aria-label="Admin navigation sidebar"
    >
      {/* Logo */}
      <div className="flex items-center px-4 py-4 border-b border-white/10">
        <Image
          src="/brand_logo.avif"
          alt="Ulsaham Entertainments"
          width={180}
          height={90}
          style={{ height: "auto" }}
          className="rounded-lg"
          priority
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
        {adminNavItems
          .filter((item) => !item.superAdminOnly || role === "SUPER_ADMIN")
          .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "sidebar-item-active"
                    : "text-white/80 sidebar-item-hover hover:text-white"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
      </nav>

      {/* User & Logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="px-3 py-2 mb-2">
          <p className="text-sm font-medium text-white truncate">{username}</p>
          <p className="text-xs text-white/60">
            {role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-white/80 hover:text-white sidebar-item-hover transition-all"
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
            Logout
          </button>
        </form>
      </div>
    </aside>
  )
}

export function MobileNav({ username, role }: SidebarProps) {
  const pathname = usePathname()

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#014421] border-t border-white/10"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around px-2 py-1">
        {adminNavItems
          .filter((item) => !item.superAdminOnly || role === "SUPER_ADMIN")
          .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                  isActive ? "text-[#FEE715]" : "text-white/70"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="hidden xs:block">{item.label}</span>
              </Link>
            )
          })}
      </div>
    </nav>
  )
}
