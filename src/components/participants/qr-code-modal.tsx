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

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string {
  ctx.font = font
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1)
  return t + "…"
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
    loadImageFromUrl("/brand_logo.avif"),
  ])

  const W = 600
  const GREEN = "#014421"
  const YELLOW = "#FEE715"
  const QR_BOX_X = 99
  const QR_BOX_W = 402
  const QR_SIZE = 260
  const QR_BOX_PAD = 22
  const HEADER_H = 255
  const BODY_Y = 225
  const POSTER_H = 210

  const INFO_Y_START = posterImg
    ? BODY_Y + 16 + POSTER_H + 48
    : BODY_Y + 24

  // "EVENT TICKET" heading (52) + 3 rows × 70px each
  const INFO_H = 52 + 3 * 70
  const QR_BOX_Y = INFO_Y_START + INFO_H + 16
  const QR_BOX_H = QR_SIZE + QR_BOX_PAD * 2 + 30
  const FOOTER_Y = QR_BOX_Y + QR_BOX_H + 20
  const H = FOOTER_Y + 84

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

  // ── Event info – 2-column grid ────────────────────────────────
  let y = INFO_Y_START

  ctx.fillStyle = "#000"
  ctx.font = "bold 30px Arial, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("EVENT TICKET", W / 2, y)
  y += 52

  const COL_L = W / 4
  const COL_R = (3 * W) / 4
  const MAX_COL_W = 250
  const ROW_H = 70
  const GRID_FONT = "bold 22px Arial, sans-serif"

  // Vertical divider spanning all 3 rows
  ctx.save()
  ctx.strokeStyle = "#00000025"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(W / 2, y - 14)
  ctx.lineTo(W / 2, y + ROW_H * 3 - 18)
  ctx.stroke()
  ctx.restore()

  ctx.font = GRID_FONT
  ctx.fillStyle = "#111"

  const cap10 = (s: string) => s.length > 10 ? s.slice(0, 10) + "..." : s
  const col = (text: string) => truncateText(ctx, text, MAX_COL_W, GRID_FONT)

  // Row 1: Name | Event
  ctx.fillText(col(`Name : ${cap10(opts.participantName)}`), COL_L, y)
  ctx.fillText(col(`Event : ${cap10(opts.eventName)}`), COL_R, y)
  y += ROW_H

  // Row 2: Admits | Venue
  const admitsStr = `${opts.numberOfParticipants} member${opts.numberOfParticipants !== 1 ? "s" : ""}`
  ctx.fillText(col(`Admits :  ${admitsStr}`), COL_L, y)
  ctx.fillText(col(`Venue :  ${opts.eventVenue}`), COL_R, y)
  y += ROW_H

  // Row 3: Date
  ctx.fillText(col(`Date : ${opts.eventDate}`), COL_L, y)

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
  ctx.font = "14px Arial, sans-serif"
  ctx.fillText("Scan this code at the entrance", W / 2, QR_Y_POS + QR_SIZE + 22)

  // ── Footer ────────────────────────────────────────────────────
  ctx.strokeStyle = "#00000015"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(QR_BOX_X, FOOTER_Y)
  ctx.lineTo(QR_BOX_X + QR_BOX_W, FOOTER_Y)
  ctx.stroke()

  ctx.fillStyle = "#000"
  ctx.font = "bold 17px Arial, sans-serif"
  ctx.fillText("Contact : 9446266011", W / 2, FOOTER_Y + 28)
  ctx.fillText("Instagram : @ulsaham_", W / 2, FOOTER_Y + 58)

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
