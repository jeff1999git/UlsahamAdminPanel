"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserCog, Settings, LogOut } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { adminNavItems } from "@/config/nav"
import { logoutAction } from "@/actions/auth.actions"

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

function roleLabel(role?: string) {
  if (role === "SUPER_ADMIN") return "Super Admin"
  if (role === "USER") return "User"
  return "Admin"
}

export function Header({ username, role }: HeaderProps) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  const isSuperAdmin = role === "SUPER_ADMIN"
  const isUser = role === "USER"

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

        {/* Profile dropdown */}
        {username && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-lg hover:bg-black/5 px-2 py-1 transition-colors focus:outline-none">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-black">{username}</p>
                  <p className="text-xs text-black">{roleLabel(role)}</p>
                </div>
                <div className="w-9 h-9 bg-[#014421] rounded-full flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-white">
                    {username[0]?.toUpperCase()}
                  </span>
                </div>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="font-semibold text-black">{username}</p>
                <p className="text-xs text-black/60">{roleLabel(role)}</p>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {isSuperAdmin && (
                <DropdownMenuItem asChild>
                  <Link href="/admin/admins" className="flex items-center gap-2 cursor-pointer">
                    <UserCog className="h-4 w-4" />
                    Accounts
                  </Link>
                </DropdownMenuItem>
              )}

              {!isUser && (
                <DropdownMenuItem asChild>
                  <Link href="/admin/settings" className="flex items-center gap-2 cursor-pointer">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="p-0 focus:bg-transparent"
              >
                <form action={logoutAction} className="w-full">
                  <button
                    type="submit"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-red-600 hover:text-red-700 rounded-sm"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
