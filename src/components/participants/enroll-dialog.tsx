"use client"

import { useState } from "react"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ParticipantForm } from "@/components/participants/participant-form"

interface EnrollDialogProps {
  eventId: string
  eventName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnrolled?: () => void
}

export function EnrollDialog({ eventId, eventName, open, onOpenChange, onEnrolled }: EnrollDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#014421]" />
            Register as Guest
          </DialogTitle>
          <DialogDescription className="text-black/60">
            {eventName}
          </DialogDescription>
        </DialogHeader>
        <ParticipantForm
          eventId={eventId}
          onSuccess={() => {
            onEnrolled?.()
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
