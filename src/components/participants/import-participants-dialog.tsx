"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { FileSpreadsheet, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// The import steps (row validation, preview, SheetJS) load when the dialog
// opens, so the participants page does not ship them with its first load.
const ImportParticipantsForm = dynamic(
  () =>
    import("@/components/participants/import-participants-form").then(
      (m) => m.ImportParticipantsForm
    ),
  {
    ssr: false,
    loading: () => (
      <>
        <DialogHeader>
          <DialogTitle>Import Participants from Excel</DialogTitle>
          <DialogDescription>
            Upload an .xlsx file with participant data. Use the template below to get the correct format.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-10" role="status" aria-label="Loading">
          <Loader2 className="h-6 w-6 animate-spin text-black/40" />
        </div>
      </>
    ),
  }
)

interface ImportParticipantsDialogProps {
  eventId: string
}

export function ImportParticipantsDialog({ eventId }: ImportParticipantsDialogProps) {
  const [open, setOpen] = useState(false)

  function handleOpenChange(next: boolean) {
    // Start fetching SheetJS as the dialog opens, so reading the chosen file
    // or downloading the template does not wait on the network.
    if (next) import("xlsx").catch(() => {})
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Import Excel
        </Button>
      </DialogTrigger>

      {/* The form unmounts when the dialog closes, so every open starts fresh. */}
      <DialogContent className="sm:max-w-2xl">
        <ImportParticipantsForm eventId={eventId} onClose={() => handleOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
