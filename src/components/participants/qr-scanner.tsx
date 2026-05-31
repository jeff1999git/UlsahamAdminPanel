"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { CheckCircle, AlertCircle, Info, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { scanAttendanceAction } from "@/actions/participant.actions"
import { cn } from "@/lib/utils"

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

interface ScanResult {
  type: "success" | "already" | "error"
  message: string
  name?: string
}

interface QRScannerProps {
  eventId: string
}

export function QRScanner({ eventId }: QRScannerProps) {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const handleScan = useCallback(
    async (results: Array<{ rawValue: string }>) => {
      const ticketCode = results[0]?.rawValue
      if (!ticketCode || ticketCode === lastCode || scanning) return

      setLastCode(ticketCode)
      setScanning(true)
      setResult(null)

      try {
        const res = await scanAttendanceAction(ticketCode, eventId)

        if (!res.success) {
          setResult({ type: "error", message: res.error })
        } else if (res.data.alreadyAttended) {
          setResult({
            type: "already",
            message: `${res.data.name} is already checked in.`,
            name: res.data.name,
          })
        } else {
          setResult({
            type: "success",
            message: `${res.data.name} — Checked In!`,
            name: res.data.name,
          })
        }
      } catch {
        setResult({ type: "error", message: "Failed to process scan. Try again." })
      } finally {
        setScanning(false)
        setTimeout(() => {
          setLastCode(null)
          setResult(null)
        }, 4000)
      }
    },
    [eventId, lastCode, scanning]
  )

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div className="relative rounded-xl overflow-hidden border-2 border-[#014421]">
        {cameraError ? (
          <div className="aspect-square flex flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm text-black">{cameraError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCameraError(null)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Camera
            </Button>
          </div>
        ) : (
          <Scanner
            onScan={handleScan}
            onError={(error) => {
              const msg = typeof error === "string" ? error : (error as { message?: string }).message ?? "Camera error"
              if (msg.toLowerCase().includes("permission")) {
                setCameraError("Camera permission denied. Please allow camera access and try again.")
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
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-white animate-spin" />
          </div>
        )}
      </div>

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
            {result.type === "success" && (
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            )}
            {result.type === "already" && (
              <Info className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
            )}
            {result.type === "error" && (
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p
                className={cn(
                  "font-semibold text-sm",
                  result.type === "success" && "text-green-800",
                  result.type === "already" && "text-yellow-800",
                  result.type === "error" && "text-red-800"
                )}
              >
                {result.type === "success"
                  ? "Checked In"
                  : result.type === "already"
                  ? "Already Attended"
                  : "Invalid Code"}
              </p>
              <p
                className={cn(
                  "text-sm",
                  result.type === "success" && "text-green-700",
                  result.type === "already" && "text-yellow-700",
                  result.type === "error" && "text-red-700"
                )}
              >
                {result.message}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-center text-sm text-black">
        <p>Point the camera at a participant's QR code</p>
        <p className="text-xs mt-1">Scanner resets automatically after each scan</p>
      </div>
    </div>
  )
}
