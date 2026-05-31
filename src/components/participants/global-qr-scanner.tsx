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
  Phone,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { scanGlobalAttendanceAction } from "@/actions/participant.actions"

const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-black/10 flex items-center justify-center">
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

  // Scanner is unmounted when result is set, so this only runs while scanning is active
  const handleScan = useCallback(
    async (results: Array<{ rawValue: string }>) => {
      const ticketCode = results[0]?.rawValue
      if (!ticketCode || ticketCode === lastCode || scanning) return

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
    [lastCode, scanning]
  )

  function dismiss() {
    setResult(null)
    setLastCode(null)
  }

  return (
    <div className="space-y-3">
      {/* Camera / result container */}
      <div className="relative rounded-xl overflow-hidden border-2 border-black max-w-lg mx-auto">

        {/* Camera view — unmounted when result is set, which stops the camera */}
        {!result && (
          cameraError ? (
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
                setCameraError(
                  msg.toLowerCase().includes("permission")
                    ? "Camera permission denied. Please allow camera access and try again."
                    : "Camera error: " + msg
                )
              }}
              constraints={{ facingMode: "environment" }}
              styles={{
                container: { width: "100%", aspectRatio: "1" },
                video: { width: "100%", height: "100%", objectFit: "cover" },
              }}
            />
          )
        )}

        {/* Processing spinner overlay */}
        {scanning && !result && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-12 w-12 text-white animate-spin" />
          </div>
        )}

        {/* Result card — replaces camera, scanning fully stopped since Scanner is unmounted */}
        {result && (
          <div
            className="bg-[#FEE715] min-h-[320px] flex flex-col p-4 cursor-pointer select-none"
            onClick={dismiss}
          >
            {/* Close */}
            <div className="flex justify-end mb-1">
              <button
                className="w-8 h-8 bg-black/10 hover:bg-black/20 rounded-full flex items-center justify-center transition-colors"
                onClick={(e) => { e.stopPropagation(); dismiss() }}
                aria-label="Close and scan next"
              >
                <X className="h-4 w-4 text-black" />
              </button>
            </div>

            {/* Status */}
            <div
              className="flex flex-col items-center text-center mb-4"
              onClick={(e) => e.stopPropagation()}
            >
              {result.type === "success" && (
                <CheckCircle2 className="h-12 w-12 text-[#014421] mb-1.5" />
              )}
              {result.type === "already" && (
                <Info className="h-12 w-12 text-black/70 mb-1.5" />
              )}
              {result.type === "error" && (
                <AlertCircle className="h-12 w-12 text-red-600 mb-1.5" />
              )}
              <h2 className="text-2xl font-bold text-black">
                {result.type === "success"
                  ? "Checked In!"
                  : result.type === "already"
                  ? "Already Checked In"
                  : "Invalid Ticket"}
              </h2>
              <p className="text-xs text-black/60 mt-0.5">
                {result.type === "success"
                  ? "Attendance marked successfully"
                  : result.type === "already"
                  ? "This participant was previously marked"
                  : result.message}
              </p>
            </div>

            {/* Details card */}
            {result.type !== "error" && (
              <div
                className="bg-black/10 border border-black/15 rounded-xl p-4 space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Name row + admits badge */}
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-black/50 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-black/50 leading-none mb-0.5">Participant</p>
                    <p className="font-bold text-black truncate">{result.data.participantName}</p>
                  </div>
                  {/* Highlighted admits count */}
                  <div className="flex flex-col items-center bg-[#014421] text-white rounded-lg px-3 py-1.5 shrink-0">
                    <p className="text-[9px] leading-none mb-0.5 tracking-wide uppercase">Admits</p>
                    <p className="text-3xl font-extrabold leading-none">
                      {result.data.numberOfParticipants}
                    </p>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-black/50 shrink-0" />
                  <div>
                    <p className="text-[10px] text-black/50 leading-none mb-0.5">Phone</p>
                    <p className="font-medium text-black">{result.data.phone}</p>
                  </div>
                </div>

                <div className="border-t border-black/15" />

                {/* Event */}
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-black/50 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-black/50 leading-none mb-0.5">Event</p>
                    <p className="font-semibold text-black">{result.data.eventName}</p>
                    <p className="text-xs text-black/70 mt-0.5">{result.data.eventDate}</p>
                  </div>
                </div>

                {/* Venue */}
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-black/50 shrink-0" />
                  <div>
                    <p className="text-[10px] text-black/50 leading-none mb-0.5">Venue</p>
                    <p className="font-medium text-black">{result.data.eventVenue}</p>
                  </div>
                </div>
              </div>
            )}

            <p className="text-center text-[11px] text-black/40 mt-4">
              Tap anywhere to scan next
            </p>
          </div>
        )}
      </div>

      {/* Hint text — only while camera is active */}
      {!result && (
        <p className="text-center text-sm text-black">
          Point the camera at a participant&apos;s QR code
        </p>
      )}
    </div>
  )
}
