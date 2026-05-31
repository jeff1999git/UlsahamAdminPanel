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
  numberOfParticipants: number
  bannerImageUrl?: string | null
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

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    const timer = setTimeout(() => resolve(null), 6000)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = url
  })
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.save()
  drawRoundRect(ctx, x, y, w, h, r)
  ctx.clip()
  const imgAspect = img.naturalWidth / img.naturalHeight
  const boxAspect = w / h
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
  if (imgAspect > boxAspect) {
    sw = img.naturalHeight * boxAspect
    sx = (img.naturalWidth - sw) / 2
  } else {
    sh = img.naturalWidth / boxAspect
    sy = (img.naturalHeight - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
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
    numberOfParticipants: number
    bannerImageUrl?: string | null
  }
): Promise<HTMLCanvasElement> {
  const [qrImg, posterImg, logoImg] = await Promise.all([
    loadSvgAsImage(svgEl),
    opts.bannerImageUrl ? loadImageFromUrl(opts.bannerImageUrl) : Promise.resolve(null),
    loadImageFromUrl("/brand_logo.png"),
  ])

  const W = 600
  const GREEN = "#014421"
  const YELLOW = "#FEE715"
  const QR_BOX_X = 99
  const QR_BOX_W = 402
  const QR_SIZE = 200
  const QR_BOX_PAD = 22
  const HEADER_H = 255
  const BODY_Y = 225
  const POSTER_H = 210

  // Measure event name lines (cap at 3)
  const probe = document.createElement("canvas").getContext("2d")!
  const nameLines = wrapText(
    probe,
    opts.eventName,
    QR_BOX_W - 20,
    "bold 22px Arial, sans-serif"
  ).slice(0, 3)

  // Info section starts below banner (if present) or just below header
  const INFO_Y_START = posterImg
    ? BODY_Y + 16 + POSTER_H + 16
    : BODY_Y + 30

  // Compute total info section height so QR box Y is fixed regardless of draw order
  const INFO_H =
    28 +                    // "EVENT TICKET" label
    nameLines.length * 30 + // event name (per line)
    10 +                    // gap after name
    24 +                    // date
    22 +                    // venue
    20 +                    // divider
    20 +                    // participant label
    30 +                    // participant name
    24 +                    // admits
    22                      // ticket code
  const QR_BOX_Y = INFO_Y_START + INFO_H + 16
  const QR_BOX_H = QR_SIZE + QR_BOX_PAD * 2 + 30
  const FOOTER_Y = QR_BOX_Y + QR_BOX_H + 28
  const H = FOOTER_Y + 82

  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!
  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "center"

  // ── Green Header ──────────────────────────────────────────────
  ctx.fillStyle = GREEN
  ctx.fillRect(0, 0, W, HEADER_H)

  // ── Yellow Body (rounded top corners) ─────────────────────────
  ctx.fillStyle = YELLOW
  drawRoundRect(ctx, 0, BODY_Y, W, H - BODY_Y, 28)
  ctx.fill()

  // ── Poster / event banner ─────────────────────────────────────
  if (posterImg) {
    drawCoverImage(ctx, posterImg, QR_BOX_X, BODY_Y + 16, QR_BOX_W, POSTER_H, 12)
  }

  // ── Brand logo ────────────────────────────────────────────────
  if (logoImg) {
    const maxLogoW = W - 80
    const maxLogoH = HEADER_H - 24
    const logoScale = Math.min(
      maxLogoW / logoImg.naturalWidth,
      maxLogoH / logoImg.naturalHeight
    )
    const lw = logoImg.naturalWidth * logoScale
    const lh = logoImg.naturalHeight * logoScale
    ctx.drawImage(logoImg, (W - lw) / 2, (HEADER_H - lh) / 2, lw, lh)
  } else {
    ctx.fillStyle = YELLOW
    ctx.font = "bold 64px 'Courier New', Courier, monospace"
    ctx.fillText("ULSAHAM", W / 2, 120)
    ctx.fillStyle = YELLOW
    ctx.font = "bold 16px Arial, sans-serif"
    ctx.fillText("ENTERTAINMENTS", W / 2, 165)
  }

  // ── Event info (yellow area) ───────────────────────────────────
  let y = INFO_Y_START

  ctx.fillStyle = "#2d6e3a"
  ctx.font = "bold 10px Arial, sans-serif"
  ctx.fillText("E V E N T   T I C K E T", W / 2, y)
  y += 28

  ctx.fillStyle = "#000"
  ctx.font = "bold 22px Arial, sans-serif"
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, y)
    y += 30
  }
  y += 10

  ctx.fillStyle = "#222"
  ctx.font = "13px Arial, sans-serif"
  ctx.fillText(opts.eventDate, W / 2, y)
  y += 24

  ctx.fillStyle = "#333"
  ctx.font = "12px Arial, sans-serif"
  ctx.fillText(opts.eventVenue, W / 2, y)
  y += 22

  ctx.strokeStyle = "#00000025"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(QR_BOX_X + 10, y)
  ctx.lineTo(QR_BOX_X + QR_BOX_W - 10, y)
  ctx.stroke()
  y += 20

  ctx.fillStyle = GREEN
  ctx.font = "bold 9px Arial, sans-serif"
  ctx.fillText("REGISTERED PARTICIPANT", W / 2, y)
  y += 20

  ctx.fillStyle = "#000"
  ctx.font = "bold 19px Arial, sans-serif"
  ctx.fillText(opts.participantName, W / 2, y)
  y += 30

  ctx.fillStyle = "#333"
  ctx.font = "12px Arial, sans-serif"
  ctx.fillText(
    `${opts.numberOfParticipants} ADMIT${opts.numberOfParticipants !== 1 ? "S" : ""}`,
    W / 2,
    y
  )
  y += 24

  ctx.fillStyle = "#666"
  ctx.font = "10px 'Courier New', Courier, monospace"
  ctx.fillText(opts.ticketCode, W / 2, y)

  // ── White QR box ──────────────────────────────────────────────
  ctx.fillStyle = "#fff"
  drawRoundRect(ctx, QR_BOX_X, QR_BOX_Y, QR_BOX_W, QR_BOX_H, 18)
  ctx.fill()

  const QR_X = (W - QR_SIZE) / 2
  const QR_Y_POS = QR_BOX_Y + QR_BOX_PAD
  ctx.fillStyle = "#fff"
  ctx.fillRect(QR_X, QR_Y_POS, QR_SIZE, QR_SIZE)
  ctx.drawImage(qrImg, QR_X, QR_Y_POS, QR_SIZE, QR_SIZE)

  ctx.fillStyle = "#666"
  ctx.font = "11px Arial, sans-serif"
  ctx.fillText("Scan this code at the entrance", W / 2, QR_Y_POS + QR_SIZE + 20)

  // ── Footer ────────────────────────────────────────────────────
  ctx.strokeStyle = "#00000015"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(QR_BOX_X, FOOTER_Y)
  ctx.lineTo(QR_BOX_X + QR_BOX_W, FOOTER_Y)
  ctx.stroke()

  ctx.fillStyle = "#000"
  ctx.font = "bold 13px Arial, sans-serif"
  ctx.fillText("Phone: 9446266011", W / 2, FOOTER_Y + 24)
  ctx.fillText("Instagram: @ulsaham_", W / 2, FOOTER_Y + 50)

  return canvas
}

export function QRCodeModal({
  ticketCode,
  participantName,
  qrCodeUrl: _qrCodeUrl,
  eventName,
  eventDate,
  eventVenue,
  numberOfParticipants,
  bannerImageUrl,
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
        numberOfParticipants,
        bannerImageUrl,
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
          <div ref={qrRef} className="bg-white p-4 rounded-lg border border-border">
            <QRCode value={ticketCode} size={180} />
          </div>
          <div className="text-center">
            <p className="font-semibold">{participantName}</p>
            <p className="text-xs font-mono mt-1">{ticketCode}</p>
            <p className="text-xs mt-0.5 text-muted-foreground">{eventName}</p>
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
