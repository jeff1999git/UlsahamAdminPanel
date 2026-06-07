"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { UserPlus, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { createAdminSchema, type CreateAdminFormValues } from "@/validators/admin.validator"
import { createAdminAction } from "@/actions/admin.actions"

interface CreateAdminDialogProps {
  role: "ADMIN" | "USER"
}

export function CreateAdminDialog({ role }: CreateAdminDialogProps) {
  const [open, setOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isAdmin = role === "ADMIN"

  const form = useForm<CreateAdminFormValues>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: { username: "", password: "", confirmPassword: "", role },
  })

  async function onSubmit(values: CreateAdminFormValues) {
    const fd = new FormData()
    fd.append("username", values.username)
    fd.append("password", values.password)
    fd.append("confirmPassword", values.confirmPassword)
    fd.append("role", role)

    const result = await createAdminAction(fd)

    if (result.success) {
      toast.success(`${isAdmin ? "Admin" : "User"} account "${result.data.username}" created`)
      form.reset()
      setOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset()
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        {isAdmin ? (
          <Button>
            <ShieldCheck className="h-4 w-4 mr-2" />
            Add Admin
          </Button>
        ) : (
          <Button variant="outline">
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isAdmin ? "Create Admin Account" : "Create User Account"}
          </DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Admins have full access to events, participants, and settings."
              : "Users can view events and participants but cannot make changes."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. john_tester" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 8 characters"
                      {...field}
                    />
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
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Repeat password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-2 text-sm">
              <input
                id={`show-pw-${role}`}
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="rounded"
              />
              <label htmlFor={`show-pw-${role}`} className="cursor-pointer text-black">
                Show passwords
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? "Creating..."
                  : `Create ${isAdmin ? "Admin" : "User"}`}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
