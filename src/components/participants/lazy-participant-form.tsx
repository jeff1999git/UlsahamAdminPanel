"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

// The add/edit participant form (react-hook-form + zod) sits behind dialogs,
// so it loads when a dialog first opens instead of with the participants page.
export const LazyParticipantForm = dynamic(
  () => import("@/components/participants/participant-form").then((m) => m.ParticipantForm),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-10" role="status" aria-label="Loading form">
        <Loader2 className="h-6 w-6 animate-spin text-black/40" />
      </div>
    ),
  }
)
