"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, RotateCcw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Shown inside the admin layout, so the navigation stays, when a page fails
 * to render (for example the database could not be reached).
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const [retrying, startTransition] = useTransition()
  // Server code throws "Unauthorized" once a session has ended (they last 24 h).
  const sessionEnded = /unauthori[sz]ed/i.test(error.message)

  useEffect(() => {
    console.error(error)
    if (sessionEnded) router.push("/login")
  }, [error, sessionEnded, router])

  function retry() {
    // Render the page again from the server, then clear this error.
    startTransition(() => {
      router.refresh()
      reset()
    })
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center" role="alert">
      <TriangleAlert className="h-10 w-10 text-yellow-600" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-black">
          {sessionEnded ? "Your session has ended" : "Something went wrong"}
        </h1>
        <p className="text-sm text-black/60 max-w-sm">
          {sessionEnded
            ? "Taking you to the sign-in page…"
            : "This page could not be loaded. Check your connection and try again."}
        </p>
        {error.digest && (
          <p className="text-xs text-black/40 font-mono">Reference: {error.digest}</p>
        )}
      </div>
      {!sessionEnded && (
        <Button onClick={retry} disabled={retrying}>
          {retrying ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Try again
        </Button>
      )}
    </div>
  )
}
