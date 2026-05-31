import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { findAllAdmins } from "@/repositories/admin.repository"
import { AdminTable } from "@/components/admin/admin-table"
import { CreateAdminDialog } from "@/components/admin/create-admin-dialog"

export const metadata = { title: "Admin Management" }

export default async function AdminsPage() {
  const session = await auth()

  if (session?.user?.role !== "SUPER_ADMIN") {
    redirect("/admin/dashboard")
  }

  const admins = await findAllAdmins()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Management</h1>
          <p className="text-black text-sm mt-1">
            Create and manage admin accounts. Only you (Super Admin) can access this page.
          </p>
        </div>
        <CreateAdminDialog />
      </div>
      <AdminTable admins={admins} />
    </div>
  )
}
