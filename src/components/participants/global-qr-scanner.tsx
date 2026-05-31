"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import {
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
  X,
  RefreshCw,
  User,
  Calendar,
  MapPin,
  Users,
  Phone,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { scanGlobalAttendanceAction } from "@/actions/participant.actions"
import { cn } from "@/lib/utils"

const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-black/10 rounded-xl flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-black" />
      </div>
    ),
  }
)

type ScanData = {
  participantName: string
  phone: string
  email: string | null
  age: number | null
  numberOfParticipants: number
  ticketCode: string
  alreadyAttended: boolean
  eventName: string
  eventDate: string
  eventVenue: string
  eventId: string
}

type ScanResult =
  | { type: "success"; data: ScanData }
  | { type: "already"; data: ScanData }
  | { type: "error"; message: string }

export function GlobalQRScanner() {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const handleScan = useCallback(
    async (results: Array<{ rawValue: string }>) => {
      const ticketCode = results[0]?.rawValue
      if (!ticketCode || ticketCode === lastCode || scanning || result) return

      setLastCode(ticketCode)
      setScanning(true)

      try {
        const res = await scanGlobalAttendanceAction(ticketCode)

        if (!res.success) {
          setResult({ type: "error", message: res.error })
        } else if (res.data.alreadyAttended) {
          setResult({ type: "already", data: res.data })
        } else {
          setResult({ type: "success", data: res.data })
        }
      } catch {
        setResult({ type: "error", message: "Failed to process scan. Try again." })
      } finally {
        setScanning(false)
      }
    },
    [lastCode, scanning, result]
  )

  function dismiss() {
    setResult(null)
    setLastCode(null)
  }

  return (
    <div className="relative">
      {/* Camera view */}
      <div className="relative rounded-xl overflow-hidden border-2 border-[#014421] max-w-lg mx-auto">
        {cameraError ? (
          <div className="aspect-square flex flex-col items-center justify-center gap-3 bg-black/5 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm text-black">{cameraError}</p>
            <Button variant="outline" size="sm" onClick={() => setCameraError(null)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Camera
            </Button>
          </div>
        ) : (
          <Scanner
            onScan={handleScan}
            onError={(error) => {
              const msg =
                typeof error === "string"
                  ? error
                  : (error as { message?: string }).message ?? "Camera error"
              if (msg.toLowerCase().includes("permission")) {
                setCameraError(
                  "Camera permission denied. Please allow camera access and try again."
                )
              } else {
                setCameraError("Camera error: " + msg)
              }
            }}
            constraints={{ facingMode: "environment" }}
            styles={{
              container: { width: "100%", aspectRatio: "1" },
              video: { width: "100%", height: "100%", objectFit: "cover" },
            }}
          />
        )}

        {scanning && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-12 w-12 text-white animate-spin" />
          </div>
        )}
      </div>

      <p className="text-center text-sm text-black mt-4">
        Point the camera at a participant&apos;s QR code
      </p>

      {/* Full-screen result overlay */}
      {result && (
        <div
          className={cn(
            "fixed inset-0 z-50 flex flex-col items-center justify-center p-6",
            result.type === "success" && "bg-[#014421]",
            result.type === "already" && "bg-[#FEE715]",
            result.type === "error" && "bg-red-600"
          )}
          onClick={dismiss}
        >
          {/* Close button */}
          <button
            className={cn(
              "absolute top-4 right-4 p-2 rounded-full transition-colors",
              result.type === "already"
                ? "bg-black/10 hover:bg-black/20 text-black"
                : "bg-white/15 hover:bg-white/25 text-white"
            )}
            onClick={(e) => { e.stopPropagation(); dismiss() }}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          <div
            className="w-full max-w-md text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Status icon + heading */}
            {result.type === "success" && (
              <>
                <CheckCircle2 className="h-20 w-20 text-white mx-auto mb-3" />
                <h2 className="text-4xl font-bold text-white mb-1">Checked In!</h2>
                <p className="text-white/70 mb-6">Attendance marked successfully</p>
              </>
            )}
            {result.type === "already" && (
              <>
                <Info className="h-20 w-20 text-black mx-auto mb-3" />
                <h2 className="text-4xl font-bold text-black mb-1">Already Checked In</h2>
                <p className="text-black/60 mb-6">This participant was previously marked</p>
              </>
            )}
            {result.type === "error" && (
              <>
                <AlertCircle className="h-20 w-20 text-white mx-auto mb-3" />
                <h2 className="text-4xl font-bold text-white mb-1">Invalid Ticket</h2>
                <p className="text-white/80 mb-6">{result.message}</p>
              </>
            )}

            {/* Participant details card (not shown on error) */}
            {result.type !== "error" && (
              <div
                className={cn(
                  "rounded-2xl p-5 text-left space-y-4",
                  result.type === "success" ? "bg-white/10 text-white" : "bg-black/10 text-black"
                )}
              >
                {/* Name */}
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 shrink-0 opacity-70" />
                  <div>
                    <p className="text-xs opacity-60">Participant</p>
                    <p className="text-xl font-bold leading-tight">{result.data.participantName}</p>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 shrink-0 opacity-70" />
                  <div>
                    <p className="text-xs opacity-60">Phone</p>
                    <p className="font-medium">{result.data.phone}</p>
                  </div>
                </div>

                <div
                  className={cn(
                    "border-t opacity-20",
                    result.type === "success" ? "border-white" : "border-black"
                  )}
                />

                {/* Event */}
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 shrink-0 opacity-70" />
                  <div>
                    <p className="text-xs opacity-60">Event</p>
                    <p className="font-semibold">{result.data.eventName}</p>
                    <p className="text-sm opacity-70">{result.data.eventDate}</p>
                  </div>
                </div>

                {/* Venue + admits */}
                <div className="flex gap-6">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 shrink-0 opacity-70" />
                    <div>
                      <p className="text-xs opacity-60">Venue</p>
                      <p className="font-medium">{result.data.eventVenue}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 shrink-0 opacity-70" />
                    <div>
                      <p className="text-xs opacity-60">Admits</p>
                      <p className="font-medium">{result.data.numberOfParticipants}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <p
            className={cn(
              "mt-8 text-sm",
              result.type === "already" ? "text-black/50" : "text-white/50"
            )}
          >
            Tap anywhere to scan next
          </p>
        </div>
      )}
    </div>
  )
}
