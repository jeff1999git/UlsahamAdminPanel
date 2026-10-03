"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginAction } from "@/actions/auth.actions"

// The browser checks the two required fields; the server action does the rest
// and redirects on success, so this only shows the pending state and the error.
export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          placeholder="Enter username"
          autoComplete="username"
          autoFocus
          required
          defaultValue={state?.username}
          aria-describedby={state ? "login-error" : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Enter password"
          autoComplete="current-password"
          required
          aria-describedby={state ? "login-error" : undefined}
        />
      </div>

      {state && (
        <p id="login-error" role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        className="w-full bg-[#014421] hover:bg-[#014421]/90"
        disabled={isPending}
      >
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Sign In
      </Button>
    </form>
  )
}
