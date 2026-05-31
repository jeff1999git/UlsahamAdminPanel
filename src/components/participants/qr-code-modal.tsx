"use client"

import { useState, useRef } from "react"
import dynamic from "next/dynamic"
import { QrCode, Download } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

const QRCode = dynamic(() => import("react-qr-code"), {
  ssr: false,
  loading: () => <Skeleton className="h-[180px] w-[180px]" />,
})

interface QRCodeModalProps {
  ticketCode: string
  participantName: string
  qrCodeUrl: string
  eventName: string
  eventDate: string
  eventVenue: string
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string[] {
  ctx.font = font
  const words = text.split(" ")
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

async function loadSvgAsImage(svgEl: SVGSVGElement): Promise<HTMLImageElement> {
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svgEl)
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

async function generateTicketCanvas(
  svgEl: SVGSVGElement,
  opts: {
    ticketCode: string
    participantName: string
    eventName: string
    eventDate: string
    eventVenue: string
  }
): Promise<HTMLCanvasElement> {
  const qrImg = await loadSvgAsImage(svgEl)

  const W = 600
  const PAD = 44

  // Measure event name line count
  const probe = document.createElement("canvas").getContext("2d")!
  const nameLines = wrapText(probe, opts.eventName, W - PAD * 2, "bold 26px sans-serif")

  // Layout
  const HEADER_H = 110
  const NAME_TOP = HEADER_H + 36
  const NAME_H = nameLines.length * 36
  const DATE_Y = NAME_TOP + NAME_H + 16
  const TEAR_Y = DATE_Y + 50
  const QR_SIZE = 220
  const QR_BOX_PAD = 20
  const QR_BOX_Y = TEAR_Y + 136
  const FOOTER_Y = QR_BOX_Y + QR_SIZE + QR_BOX_PAD * 2 + 48
  const H = FOOTER_Y + 52

  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!
  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "center"

  // ── Background ────────────────────────────────────────────
  ctx.fillStyle = "#FEE715"
  ctx.fillRect(0, 0, W, H)

  // ── Header ────────────────────────────────────────────────
  ctx.fillStyle = "#014421"
  ctx.fillRect(0, 0, W, HEADER_H)

  // Yellow accent stripe at bottom of header
  ctx.fillStyle = "#FEE715"
  ctx.fillRect(0, HEADER_H - 3, W, 3)

  ctx.fillStyle = "#FEE715"
  ctx.font = "bold 13px sans-serif"
  ctx.fillText("ULSAHAM ENTERTAINMENTS", W / 2, 46)

  ctx.fillStyle = "rgba(255,255,255,0.65)"
  ctx.font = "11px sans-serif"
  ctx.fillText("E V E N T   T I C K E T", W / 2, 70)

  // ── Event info ────────────────────────────────────────────
  ctx.fillStyle = "#0f2e1a"
  ctx.font = "bold 26px sans-serif"
  let ny = NAME_TOP
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, ny)
    ny += 36
  }

  ctx.fillStyle = "#666"
  ctx.font = "14px sans-serif"
  ctx.fillText(`${opts.eventDate}  ·  ${opts.eventVenue}`, W / 2, DATE_Y)

  // ── Tear line ─────────────────────────────────────────────
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = "#000"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(PAD, TEAR_Y)
  ctx.lineTo(W - PAD, TEAR_Y)
  ctx.stroke()
  ctx.setLineDash([])

  // ── Participant stub ──────────────────────────────────────
  ctx.fillStyle = "#014421"
  ctx.font = "bold 10px sans-serif"
  ctx.fillText("A D M I T   O N E", W / 2, TEAR_Y + 30)

  ctx.fillStyle = "#111"
  ctx.font = "bold 20px sans-serif"
  ctx.fillText(opts.participantName, W / 2, TEAR_Y + 62)

  ctx.fillStyle = "#888"
  ctx.font = "13px monospace"
  ctx.fillText(opts.ticketCode, W / 2, TEAR_Y + 88)

  // ── QR card ───────────────────────────────────────────────
  ctx.fillStyle = "#FEE715"
  ctx.strokeStyle = "#000"
  ctx.lineWidth = 1
  ctx.fillRect(PAD, QR_BOX_Y, W - PAD * 2, QR_SIZE + QR_BOX_PAD * 2)
  ctx.strokeRect(PAD, QR_BOX_Y, W - PAD * 2, QR_SIZE + QR_BOX_PAD * 2)

  const qrX = (W - QR_SIZE) / 2
  const qrY = QR_BOX_Y + QR_BOX_PAD
  ctx.fillStyle = "#fff"
  ctx.fillRect(qrX, qrY, QR_SIZE, QR_SIZE)
  ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE)

  // ── Scan instruction ──────────────────────────────────────
  ctx.fillStyle = "#999"
  ctx.font = "12px sans-serif"
  ctx.fillText(
    "Scan this code at the entrance",
    W / 2,
    QR_BOX_Y + QR_SIZE + QR_BOX_PAD * 2 + 22
  )

  // ── Footer ────────────────────────────────────────────────
  ctx.strokeStyle = "#000"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, FOOTER_Y)
  ctx.lineTo(W - PAD, FOOTER_Y)
  ctx.stroke()

  ctx.fillStyle = "#000"
  ctx.font = "11px sans-serif"
  ctx.fillText("Ulsaham Entertainments  ·  Thrissur, Kerala", W / 2, FOOTER_Y + 22)

  // Outer border
  ctx.strokeStyle = "#000"
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1)

  return canvas
}

export function QRCodeModal({
  ticketCode,
  participantName,
  qrCodeUrl: _qrCodeUrl,
  eventName,
  eventDate,
  eventVenue,
}: QRCodeModalProps) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  async function handleDownload() {
    const svgEl = qrRef.current?.querySelector("svg")
    if (!svgEl) {
      toast.error("QR code not ready — please wait a moment")
      return
    }
    setDownloading(true)
    try {
      const canvas = await generateTicketCanvas(svgEl as SVGSVGElement, {
        ticketCode,
        participantName,
        eventName,
        eventDate,
        eventVenue,
      })
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `ticket-${ticketCode}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, "image/png")
    } catch {
      toast.error("Failed to generate ticket")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View QR code">
          <QrCode className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ticket QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div ref={qrRef} className="bg-white p-4 rounded-lg border border-gray-200">
            <QRCode value={ticketCode} size={180} />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900">{participantName}</p>
            <p className="text-xs text-gray-500 font-mono mt-1">{ticketCode}</p>
            <p className="text-xs text-gray-400 mt-0.5">{eventName}</p>
          </div>
          <Button onClick={handleDownload} disabled={downloading} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            {downloading ? "Generating Ticket..." : "Download Ticket"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
