"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { MoreHorizontal, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog"
import { toggleAdminActiveAction, deleteAdminAction } from "@/actions/admin.actions"
import { formatDate } from "@/lib/utils"

interface AdminRow {
  id: string
  username: string
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

interface AdminTableProps {
  admins: AdminRow[]
}

export function AdminTable({ admins }: AdminTableProps) {
  const [pending, startTransition] = useTransition()

  function handleToggle(adminId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await toggleAdminActiveAction(adminId, isActive)
      if (result.success) {
        toast.success(isActive ? "Admin activated" : "Admin deactivated")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete(adminId: string) {
    startTransition(async () => {
      const result = await deleteAdminAction(adminId)
      if (result.success) {
        toast.success("Admin account deleted")
      } else {
        toast.error(result.error)
      }
    })
  }

  if (admins.length === 0) {
    return (
      <div className="text-center py-12 text-black">
        No admin accounts yet. Create one using the button above.
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Username</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {admins.map((admin) => (
            <TableRow key={admin.id}>
              <TableCell className="font-medium">{admin.username}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={admin.isActive}
                    onCheckedChange={(checked) => handleToggle(admin.id, checked)}
                    disabled={pending}
                    aria-label={`Toggle active status for ${admin.username}`}
                  />
                  <Badge variant={admin.isActive ? "default" : "secondary"}>
                    {admin.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="text-black text-sm">
                {admin.lastLoginAt ? formatDate(admin.lastLoginAt) : "Never"}
              </TableCell>
              <TableCell className="text-black text-sm">
                {formatDate(admin.createdAt)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Admin actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <ResetPasswordDialog adminId={admin.id} adminUsername={admin.username} />
                    <DropdownMenuSeparator />
                    <ConfirmDialog
                      title={`Delete "${admin.username}"?`}
                      description="This action cannot be undone. The admin account will be permanently deleted."
                      confirmLabel="Delete"
                      variant="destructive"
                      onConfirm={() => handleDelete(admin.id)}
                      trigger={
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      }
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
