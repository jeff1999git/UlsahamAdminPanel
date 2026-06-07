"use client"

import { useState, useCallback, useEffect, useRef } from "react"
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
  Users,
  Minus,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { scanGlobalAttendanceAction, confirmGlobalEntryAction } from "@/actions/participant.actions"
import type { GlobalScanData } from "@/actions/participant.actions"

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

type SuccessData = {
  name: string
  enteredCount: number
  numberOfParticipants: number
  phone: string
  eventName: string
  eventDate: string
  eventVenue: string
}

type ScanState =
  | { type: "idle" }
  | { type: "pending"; data: GlobalScanData }
  | { type: "success"; data: SuccessData }
  | { type: "already"; data: GlobalScanData }
  | { type: "error"; message: string }

const AUTO_CLOSE_SECS = 10

export function GlobalQRScanner() {
  const [state, setState] = useState<ScanState>({ type: "idle" })
  const [entryCount, setEntryCount] = useState(1)
  const [scanning, setScanning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECS)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearTimers() {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  useEffect(() => {
    if (state.type !== "already") return

    setCountdown(AUTO_CLOSE_SECS)
    intervalRef.current = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    timerRef.current = setTimeout(dismiss, AUTO_CLOSE_SECS * 1000)

    return clearTimers
  }, [state])

  function dismiss() {
    clearTimers()
    setState({ type: "idle" })
    setLastCode(null)
    setEntryCount(1)
  }

  const handleScan = useCallback(
    async (results: Array<{ rawValue: string }>) => {
      const ticketCode = results[0]?.rawValue
      if (!ticketCode || ticketCode === lastCode || scanning || state.type === "pending") return

      setLastCode(ticketCode)
      setScanning(true)

      try {
        const res = await scanGlobalAttendanceAction(ticketCode)

        if (!res.success) {
          setState({ type: "error", message: res.error })
          return
        }

        const data = res.data

        if (data.fullyEntered) {
          setState({ type: "already", data })
          return
        }

        if (data.needsCountInput) {
          setState({ type: "pending", data })
          setEntryCount(1)
        } else {
          // Single person — auto-confirm
          const confirm = await confirmGlobalEntryAction(data.participantId, data.eventId, 1)
          if (confirm.success) {
            setState({
              type: "success",
              data: {
                name: confirm.data.name,
                enteredCount: confirm.data.enteredCount,
                numberOfParticipants: confirm.data.numberOfParticipants,
                phone: data.phone,
                eventName: data.eventName,
                eventDate: data.eventDate,
                eventVenue: data.eventVenue,
              },
            })
          } else {
            setState({ type: "error", message: confirm.error })
          }
        }
      } catch {
        setState({ type: "error", message: "Failed to process scan. Try again." })
      } finally {
        setScanning(false)
      }
    },
    [lastCode, scanning, state.type]
  )

  async function handleConfirmEntry() {
    if (state.type !== "pending" || confirming) return
    setConfirming(true)
    const { data } = state

    try {
      const res = await confirmGlobalEntryAction(data.participantId, data.eventId, entryCount)
      if (res.success) {
        setState({
          type: "success",
          data: {
            name: res.data.name,
            enteredCount: res.data.enteredCount,
            numberOfParticipants: res.data.numberOfParticipants,
            phone: data.phone,
            eventName: data.eventName,
            eventDate: data.eventDate,
            eventVenue: data.eventVenue,
          },
        })
      } else {
        setState({ type: "error", message: res.error })
      }
    } catch {
      setState({ type: "error", message: "Failed to confirm entry." })
    } finally {
      setConfirming(false)
      setLastCode(null)
      setEntryCount(1)
    }
  }

  const showCamera = state.type === "idle" || state.type === "already"
  const pendingData = state.type === "pending" ? state.data : null
  const remaining = pendingData ? pendingData.remaining : 1

  return (
    <div className="space-y-3">
      {/* Camera container */}
      <div className="relative rounded-xl overflow-hidden border-2 border-black max-w-lg mx-auto">

        {showCamera && !cameraError && (
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
        )}

        {state.type === "idle" && cameraError && (
          <div className="aspect-square flex flex-col items-center justify-center gap-3 bg-black/5 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm text-black">{cameraError}</p>
            <Button variant="outline" size="sm" onClick={() => setCameraError(null)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Camera
            </Button>
          </div>
        )}

        {scanning && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-12 w-12 text-white animate-spin" />
          </div>
        )}

        {/* Multi-person count input — replaces camera */}
        {state.type === "pending" && pendingData && (
          <div className="bg-[#FEE715] min-h-[320px] flex flex-col p-4">
            <div className="flex justify-end mb-1">
              <button
                className="w-8 h-8 bg-black/10 hover:bg-black/20 rounded-full flex items-center justify-center transition-colors"
                onClick={dismiss}
                aria-label="Close"
              >
                <X className="h-4 w-4 text-black" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center mb-5">
              <Users className="h-10 w-10 text-[#014421] mb-1.5" />
              <h2 className="text-xl font-bold text-black">Group Ticket</h2>
              <p className="text-sm text-black/70 mt-0.5">{pendingData.participantName}</p>
              <p className="text-xs text-black/50 mt-1">
                {pendingData.numberOfParticipants} member ticket
                {pendingData.enteredCount > 0 && ` · ${pendingData.enteredCount} already entered`}
                {" · "}{remaining} remaining
              </p>
            </div>

            <div className="bg-black/10 border border-black/15 rounded-xl p-4 space-y-4">
              <p className="text-sm font-semibold text-black text-center">How many entering now?</p>

              <div className="flex items-center justify-center gap-5">
                <button
                  type="button"
                  className="w-11 h-11 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors disabled:opacity-40"
                  onClick={() => setEntryCount((c) => Math.max(1, c - 1))}
                  disabled={entryCount <= 1 || confirming}
                >
                  <Minus className="h-5 w-5 text-black" />
                </button>
                <span className="text-5xl font-extrabold text-black w-16 text-center leading-none">
                  {entryCount}
                </span>
                <button
                  type="button"
                  className="w-11 h-11 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors disabled:opacity-40"
                  onClick={() => setEntryCount((c) => Math.min(remaining, c + 1))}
                  disabled={entryCount >= remaining || confirming}
                >
                  <Plus className="h-5 w-5 text-black" />
                </button>
              </div>

              <Button
                className="w-full bg-[#014421] hover:bg-[#014421]/90 text-white"
                onClick={handleConfirmEntry}
                disabled={confirming}
              >
                {confirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Entry
              </Button>
            </div>

            <p className="text-center text-[11px] text-black/40 mt-4">Tap × to cancel</p>
          </div>
        )}

        {/* Success / Error */}
        {(state.type === "success" || state.type === "error") && (
          <div
            className="bg-[#FEE715] min-h-[320px] flex flex-col p-4 cursor-pointer select-none"
            onClick={dismiss}
          >
            <div className="flex justify-end mb-1">
              <button
                className="w-8 h-8 bg-black/10 hover:bg-black/20 rounded-full flex items-center justify-center transition-colors"
                onClick={(e) => { e.stopPropagation(); dismiss() }}
                aria-label="Close"
              >
                <X className="h-4 w-4 text-black" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center mb-4" onClick={(e) => e.stopPropagation()}>
              {state.type === "success"
                ? <CheckCircle2 className="h-12 w-12 text-[#014421] mb-1.5" />
                : <AlertCircle className="h-12 w-12 text-red-600 mb-1.5" />}
              <h2 className="text-2xl font-bold text-black">
                {state.type === "success" ? "Checked In!" : "Invalid Ticket"}
              </h2>
              <p className="text-xs text-black/60 mt-0.5">
                {state.type === "success"
                  ? "Attendance marked successfully"
                  : state.message}
              </p>
            </div>

            {state.type === "success" && (
              <div
                className="bg-black/10 border border-black/15 rounded-xl p-4 space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-black/50 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-black/50 leading-none mb-0.5">Participant</p>
                    <p className="font-bold text-black truncate">{state.data.name}</p>
                  </div>
                  <div className="flex flex-col items-center bg-[#014421] text-white rounded-lg px-3 py-1.5 shrink-0">
                    <p className="text-[9px] leading-none mb-0.5 tracking-wide uppercase">Entered</p>
                    <p className="text-3xl font-extrabold leading-none">{state.data.enteredCount}</p>
                    <p className="text-[9px] leading-none mt-0.5 opacity-70">of {state.data.numberOfParticipants}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-black/50 shrink-0" />
                  <div>
                    <p className="text-[10px] text-black/50 leading-none mb-0.5">Phone</p>
                    <p className="font-medium text-black">{state.data.phone}</p>
                  </div>
                </div>

                <div className="border-t border-black/15" />

                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-black/50 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-black/50 leading-none mb-0.5">Event</p>
                    <p className="font-semibold text-black">{state.data.eventName}</p>
                    <p className="text-xs text-black/70 mt-0.5">{state.data.eventDate}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-black/50 shrink-0" />
                  <div>
                    <p className="text-[10px] text-black/50 leading-none mb-0.5">Venue</p>
                    <p className="font-medium text-black">{state.data.eventVenue}</p>
                  </div>
                </div>
              </div>
            )}

            <p className="text-center text-[11px] text-black/40 mt-4">Tap anywhere to scan next</p>
          </div>
        )}
      </div>

      {state.type === "idle" && (
        <p className="text-center text-sm text-black">
          Point the camera at a participant&apos;s QR code
        </p>
      )}

      {/* Already checked in banner */}
      {state.type === "already" && (
        <div className="bg-red-600 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-white shrink-0" />
              <span className="text-xs font-bold text-white uppercase tracking-wide">
                Already Checked In
              </span>
            </div>
            <button
              className="flex items-center gap-1 bg-white/20 hover:bg-white/35 text-white text-xs font-semibold px-2.5 py-1 rounded-full transition-colors shrink-0"
              onClick={dismiss}
              aria-label="Close"
            >
              <X className="h-3 w-3" />
              {countdown}s
            </button>
          </div>

          <p className="text-white font-bold text-base leading-tight">
            {state.data.participantName}
          </p>
          <p className="text-white/75 text-sm mt-0.5">{state.data.phone}</p>
          <p className="text-white/60 text-xs mt-1">
            All {state.data.numberOfParticipants} member{state.data.numberOfParticipants !== 1 ? "s" : ""} have entered
          </p>

          <div className="mt-3 h-1 bg-white/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{ width: `${(countdown / AUTO_CLOSE_SECS) * 100}%`, transition: "width 1s linear" }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
