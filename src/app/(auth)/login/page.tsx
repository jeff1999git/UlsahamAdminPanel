"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { loginAction } from "@/actions/auth.actions"
import { APP_NAME } from "@/constants"

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  })

  const isSubmitting = form.formState.isSubmitting

  async function onSubmit(values: LoginFormValues) {
    try {
      const result = await loginAction(values)
      if (result && !result.success) {
        toast.error(result.error)
        return
      }
      router.push("/admin/dashboard")
      router.refresh()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Login failed"
      if (!msg.includes("NEXT_REDIRECT")) {
        toast.error("Login failed. Please try again.")
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#014421] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/brand_logo.png"
            alt={APP_NAME}
            width={220}
            height={110}
            style={{ height: "auto" }}
            className="rounded-2xl shadow-lg"
            priority
          />
          <p className="text-white/70 text-sm">Admin Panel</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your admin credentials to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter username"
                          autoComplete="username"
                          autoFocus
                          {...field}
                        />
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
                          type="password"
                          placeholder="Enter password"
                          autoComplete="current-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full bg-[#014421] hover:bg-[#014421]/90"
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-white/50 text-xs">
          Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  )
}
