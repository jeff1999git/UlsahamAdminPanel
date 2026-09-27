"use client"

import { useEffect, useId, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserCog, Settings, LogOut } from "lucide-react"
import { adminNavItems } from "@/config/nav"
import { logoutAction } from "@/actions/auth.actions"
import { ROLE_LABELS } from "@/constants"

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
  return (role && ROLE_LABELS[role]) || "Admin"
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
            src="/brand_logo_440.avif"
            alt="Ulsaham Entertainments"
            width={110}
            height={55}
            style={{ height: "auto" }}
            priority
          />
        </div>

        {/* Page title (a <p>: each page has its own h1) */}
        <p className="hidden lg:block text-xl font-bold text-black">{title}</p>

        {/* Profile menu */}
        {username && <ProfileMenu username={username} role={role} />}
      </div>
    </header>
  )
}

const MENU_ITEM_CLASS =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"

/**
 * The account menu as a plain disclosure (a button and a panel of links),
 * instead of a Radix dropdown that cost ~20 KB of JS on every admin page.
 * Escape closes it and returns focus to the button; a click outside, or
 * tabbing out of it, closes it too.
 */
function ProfileMenu({ username, role }: { username: string; role?: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const pathname = usePathname()

  const isSuperAdmin = role === "SUPER_ADMIN"

  // Close once a navigation lands (a menu link, or Back/Forward).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    // Focus moved to something outside the menu (Tab). A null target means a
    // click on something unfocusable; the pointerdown handler covers that.
    const next = e.relatedTarget as Node | null
    if (next && !e.currentTarget.contains(next)) setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative" onBlur={handleBlur}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-lg hover:bg-black/5 px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
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

      <div
        id={menuId}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <div className="px-2 py-1.5 text-sm">
          <p className="font-semibold text-black">{username}</p>
          <p className="text-xs text-black/60">{roleLabel(role)}</p>
        </div>

        <div className="-mx-1 my-1 h-px bg-muted" aria-hidden="true" />

        {/* Rarely opened, so not prefetched. */}
        {isSuperAdmin && (
          <Link href="/admin/admins" prefetch={false} className={MENU_ITEM_CLASS} onClick={() => setOpen(false)}>
            <UserCog className="h-4 w-4" />
            Accounts
          </Link>
        )}

        {isSuperAdmin && (
          <Link href="/admin/settings" prefetch={false} className={MENU_ITEM_CLASS} onClick={() => setOpen(false)}>
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        )}

        <div className="-mx-1 my-1 h-px bg-muted" aria-hidden="true" />

        <form action={logoutAction} className="w-full">
          <button
            type="submit"
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-red-600 hover:text-red-700 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </form>
      </div>
    </div>
  )
}
