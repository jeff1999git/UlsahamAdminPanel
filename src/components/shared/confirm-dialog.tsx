"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  /** The button that opens the dialog. Leave it out and pass `open` to open it from elsewhere. */
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Where focus goes on close; by default Radix returns it to the trigger. */
  onCloseAutoFocus?: (event: Event) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "destructive" | "default"
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  onCloseAutoFocus,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
}: ConfirmDialogProps) {
  const [openState, setOpenState] = useState(false)
  const [loading, setLoading] = useState(false)

  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : openState

  function setOpen(next: boolean) {
    if (!isControlled) setOpenState(next)
    onOpenChange?.(next)
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant={variant}
              onClick={handleConfirm}
              disabled={loading}
              aria-label={confirmLabel}
            >
              {loading ? "Processing..." : confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
