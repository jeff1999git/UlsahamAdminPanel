"use client"

import { Zap } from "lucide-react"
import { usePathname } from "next/navigation"
import { adminNavItems } from "@/config/nav"

interface HeaderProps {
  username?: string
  role?: string
}

function getPageTitle(pathname: string): string {
  const exact = adminNavItems.find((item) => item.href === pathname)
  if (exact) return exact.label
  const prefix = adminNavItems.find((item) => pathname.startsWith(item.href + "/"))
  if (prefix) return prefix.label
  return "Dashboard"
}

export function Header({ username, role }: HeaderProps) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <header className="sticky top-0 z-30 bg-background border-b border-black px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Mobile logo */}
        <div className="flex items-center gap-3 lg:hidden">
          <div className="w-7 h-7 bg-[#014421] rounded-lg flex items-center justify-center">
            <Zap className="h-4 w-4 text-[#FEE715]" />
          </div>
          <span className="font-bold text-sm text-[#014421]">Ulsaham</span>
        </div>

        {/* Page title */}
        <h1 className="hidden lg:block text-xl font-bold text-gray-900">{title}</h1>

        {/* User info */}
        {username && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-gray-900">{username}</p>
              <p className="text-xs text-gray-500">
                {role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
              </p>
            </div>
            <div
              className="w-8 h-8 bg-[#014421] rounded-full flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="text-sm font-bold text-white">
                {username[0]?.toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
