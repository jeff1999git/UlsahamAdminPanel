import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Sidebar, MobileNav } from "@/components/admin/sidebar"
import { Header } from "@/components/admin/header"
import type { AdminRole } from "@prisma/client"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  const username =
    (session.user as { username?: string }).username ??
    session.user.name ??
    "Admin"
  const role = (session.user as { role?: AdminRole }).role ?? "ADMIN"

  return (
    <div className="min-h-screen bg-background">
      <Sidebar username={username} role={role} />

      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header username={username} role={role} />
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6">{children}</main>
      </div>

      <MobileNav username={username} role={role} />
    </div>
  )
}
