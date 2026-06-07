"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { CheckCircle, AlertCircle, Info, Loader2, RefreshCw, Minus, Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { scanAttendanceAction, confirmEntryAction } from "@/actions/participant.actions"
import { cn } from "@/lib/utils"
import type { ScanEntryData } from "@/actions/participant.actions"

const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-black/10 rounded-lg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-black" />
      </div>
    ),
  }
)

type ResultState =
  | { type: "success"; name: string; enteredCount: number; numberOfParticipants: number }
  | { type: "already"; name: string }
  | { type: "error"; message: string }

interface QRScannerProps {
  eventId: string
}

export function QRScanner({ eventId }: QRScannerProps) {
  const [result, setResult] = useState<ResultState | null>(null)
  const [pending, setPending] = useState<ScanEntryData | null>(null)
  const [entryCount, setEntryCount] = useState(1)
  const [scanning, setScanning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  function resetAll() {
    setResult(null)
    setPending(null)
    setEntryCount(1)
    setLastCode(null)
  }

  const handleScan = useCallback(
    async (results: Array<{ rawValue: string }>) => {
      const ticketCode = results[0]?.rawValue
      if (!ticketCode || ticketCode === lastCode || scanning || pending) return

      setLastCode(ticketCode)
      setScanning(true)
      setResult(null)

      try {
        const res = await scanAttendanceAction(ticketCode, eventId)

        if (!res.success) {
          setResult({ type: "error", message: res.error })
          setTimeout(resetAll, 4000)
          return
        }

        const data = res.data

        if (data.fullyEntered) {
          setResult({ type: "already", name: data.name })
          setTimeout(resetAll, 4000)
          return
        }

        if (data.needsCountInput) {
          // Multi-person: show count input before confirming
          setPending(data)
          setEntryCount(Math.min(1, data.remaining))
        } else {
          // Single person: auto-confirm with count=1
          const confirm = await confirmEntryAction(data.participantId, eventId, 1)
          if (confirm.success) {
            setResult({
              type: "success",
              name: confirm.data.name,
              enteredCount: confirm.data.enteredCount,
              numberOfParticipants: confirm.data.numberOfParticipants,
            })
          } else {
            setResult({ type: "error", message: confirm.error })
          }
          setTimeout(resetAll, 4000)
        }
      } catch {
        setResult({ type: "error", message: "Failed to process scan. Try again." })
        setTimeout(resetAll, 4000)
      } finally {
        setScanning(false)
      }
    },
    [eventId, lastCode, scanning, pending]
  )

  async function handleConfirmEntry() {
    if (!pending || confirming) return
    setConfirming(true)
    try {
      const res = await confirmEntryAction(pending.participantId, eventId, entryCount)
      if (res.success) {
        setResult({
          type: "success",
          name: res.data.name,
          enteredCount: res.data.enteredCount,
          numberOfParticipants: res.data.numberOfParticipants,
        })
        setPending(null)
        setTimeout(resetAll, 4000)
      } else {
        setResult({ type: "error", message: res.error })
        setPending(null)
        setTimeout(resetAll, 4000)
      }
    } catch {
      setResult({ type: "error", message: "Failed to confirm entry." })
      setPending(null)
      setTimeout(resetAll, 4000)
    } finally {
      setConfirming(false)
    }
  }

  const remaining = pending?.remaining ?? 1

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div className="relative rounded-xl overflow-hidden border-2 border-[#014421]">
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
              const msg = typeof error === "string" ? error : (error as { message?: string }).message ?? "Camera error"
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
        )}

        {scanning && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Multi-person count input */}
      {pending && (
        <Card className="border-2 border-[#014421]">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#014421]" />
              <span className="font-semibold text-black text-sm">{pending.name}</span>
            </div>
            <p className="text-xs text-black/60">
              Ticket for <strong>{pending.numberOfParticipants}</strong> member{pending.numberOfParticipants !== 1 ? "s" : ""}
              {pending.enteredCount > 0 && ` · ${pending.enteredCount} already entered`}
              {" · "}<strong>{remaining}</strong> remaining
            </p>

            <div>
              <p className="text-xs text-black/70 mb-2 font-medium">How many entering now?</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="w-9 h-9 rounded-full border border-black/20 flex items-center justify-center hover:bg-black/5 disabled:opacity-40"
                  onClick={() => setEntryCount((c) => Math.max(1, c - 1))}
                  disabled={entryCount <= 1}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-2xl font-bold text-black w-8 text-center">{entryCount}</span>
                <button
                  type="button"
                  className="w-9 h-9 rounded-full border border-black/20 flex items-center justify-center hover:bg-black/5 disabled:opacity-40"
                  onClick={() => setEntryCount((c) => Math.min(remaining, c + 1))}
                  disabled={entryCount >= remaining}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1 bg-[#014421] hover:bg-[#014421]/90"
                onClick={handleConfirmEntry}
                disabled={confirming}
              >
                {confirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Entry
              </Button>
              <Button variant="outline" onClick={resetAll} disabled={confirming}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scan result */}
      {result && (
        <Card
          className={cn(
            "border-2",
            result.type === "success" && "border-green-500 bg-green-50",
            result.type === "already" && "border-yellow-500 bg-yellow-50",
            result.type === "error" && "border-red-500 bg-red-50"
          )}
        >
          <CardContent className="flex items-start gap-3 p-4">
            {result.type === "success" && <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />}
            {result.type === "already" && <Info className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />}
            {result.type === "error" && <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />}
            <div>
              <p className={cn(
                "font-semibold text-sm",
                result.type === "success" && "text-green-800",
                result.type === "already" && "text-yellow-800",
                result.type === "error" && "text-red-800"
              )}>
                {result.type === "success" ? "Checked In" : result.type === "already" ? "Already Attended" : "Invalid Code"}
              </p>
              <p className={cn(
                "text-sm",
                result.type === "success" && "text-green-700",
                result.type === "already" && "text-yellow-700",
                result.type === "error" && "text-red-700"
              )}>
                {result.type === "success"
                  ? `${result.name} — ${result.enteredCount}/${result.numberOfParticipants} member${result.numberOfParticipants !== 1 ? "s" : ""} entered`
                  : result.type === "already"
                  ? `${result.name} is already fully checked in.`
                  : result.message}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!pending && !result && (
        <div className="text-center text-sm text-black">
          <p>Point the camera at a participant&apos;s QR code</p>
          <p className="text-xs mt-1">Scanner resets automatically after each scan</p>
        </div>
      )}
    </div>
  )
}
