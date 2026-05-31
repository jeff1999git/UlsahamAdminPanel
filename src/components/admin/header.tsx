"use client"

import Image from "next/image"
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
        <div className="lg:hidden bg-[#014421] rounded-xl px-2 py-1">
          <Image
            src="/brand_logo.avif"
            alt="Ulsaham Entertainments"
            width={110}
            height={55}
            style={{ height: "auto" }}
            priority
          />
        </div>

        {/* Page title */}
        <h1 className="hidden lg:block text-xl font-bold text-black">{title}</h1>

        {/* User info */}
        {username && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-black">{username}</p>
              <p className="text-xs text-black">
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
