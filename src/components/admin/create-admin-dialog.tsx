"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"
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
import { createAdminSchema, type CreateAdminFormValues } from "@/validators/admin.validator"
import { createAdminAction } from "@/actions/admin.actions"

export function CreateAdminDialog() {
  const [open, setOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<CreateAdminFormValues>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: { username: "", password: "", confirmPassword: "", role: "ADMIN" },
  })

  async function onSubmit(values: CreateAdminFormValues) {
    const fd = new FormData()
    fd.append("username", values.username)
    fd.append("password", values.password)
    fd.append("confirmPassword", values.confirmPassword)
    fd.append("role", values.role)

    const result = await createAdminAction(fd)

    if (result.success) {
      toast.success(`Account "${result.data.username}" created`)
      form.reset()
      setOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Account</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Role selector */}
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Type</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-2">
                      {(["ADMIN", "USER"] as const).map((r) => (
                        <label
                          key={r}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                            field.value === r
                              ? "border-[#014421] bg-[#014421]/5 text-[#014421]"
                              : "border-black/20 text-black/60 hover:border-black/40"
                          }`}
                        >
                          <input
                            type="radio"
                            value={r}
                            checked={field.value === r}
                            onChange={() => field.onChange(r)}
                            className="sr-only"
                          />
                          <span>{r === "ADMIN" ? "Admin" : "User"}</span>
                          <span className="text-xs font-normal text-black/40 ml-auto">
                            {r === "ADMIN" ? "Full access" : "Events only"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                id="show-pw"
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="show-pw" className="cursor-pointer text-black">
                Show passwords
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating..." : "Create Account"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
