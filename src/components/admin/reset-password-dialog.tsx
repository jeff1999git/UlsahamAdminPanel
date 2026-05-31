"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { resetPasswordSchema, type ResetPasswordFormValues } from "@/validators/admin.validator"
import { resetAdminPasswordAction } from "@/actions/admin.actions"

interface ResetPasswordDialogProps {
  adminId: string
  adminUsername: string
}

export function ResetPasswordDialog({ adminId, adminUsername }: ResetPasswordDialogProps) {
  const [open, setOpen] = useState(false)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { adminId, newPassword: "", confirmPassword: "" },
  })

  async function onSubmit(values: ResetPasswordFormValues) {
    const fd = new FormData()
    fd.append("adminId", values.adminId)
    fd.append("newPassword", values.newPassword)
    fd.append("confirmPassword", values.confirmPassword)

    const result = await resetAdminPasswordAction(fd)

    if (result.success) {
      toast.success(`Password reset for "${adminUsername}"`)
      form.reset({ adminId, newPassword: "", confirmPassword: "" })
      setOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left">
          <KeyRound className="h-4 w-4" />
          Reset Password
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password — {adminUsername}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <input type="hidden" {...form.register("adminId")} />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Min 8 characters" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Repeat password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
