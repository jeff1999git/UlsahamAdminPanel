"use client"

import { useState, useRef, useCallback } from "react"
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { Loader2, CropIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface LogoCropDialogProps {
  open: boolean
  imgSrc: string
  onCropped: (blob: Blob, previewUrl: string) => void
  onCancel: () => void
}

function initCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 80 }, 1, width, height),
    width,
    height
  )
}

async function extractCrop(
  imgEl: HTMLImageElement,
  pixelCrop: PixelCrop
): Promise<{ blob: Blob; url: string }> {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")

  const scaleX = imgEl.naturalWidth / imgEl.width
  const scaleY = imgEl.naturalHeight / imgEl.height

  // Always output 512×512 for consistent logo sizing
  const OUTPUT = 512
  canvas.width = OUTPUT
  canvas.height = OUTPUT

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"

  ctx.drawImage(
    imgEl,
    Math.round(pixelCrop.x * scaleX),
    Math.round(pixelCrop.y * scaleY),
    Math.round(pixelCrop.width * scaleX),
    Math.round(pixelCrop.height * scaleY),
    0,
    0,
    OUTPUT,
    OUTPUT
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error("Failed to extract crop")); return }
        resolve({ blob, url: URL.createObjectURL(blob) })
      },
      "image/png",
      0.95
    )
  })
}

export function LogoCropDialog({ open, imgSrc, onCropped, onCancel }: LogoCropDialogProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [processing, setProcessing] = useState(false)

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    setCrop(initCrop(width, height))
  }, [])

  async function handleConfirm() {
    if (!imgRef.current || !completedCrop) return
    setProcessing(true)
    try {
      const { blob, url } = await extractCrop(imgRef.current, completedCrop)
      onCropped(blob, url)
    } catch {
      // extractCrop failure is surfaced via the parent toast
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="h-4 w-4" />
            Crop Logo — 1:1
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center rounded-lg bg-black/5 overflow-hidden p-2">
          <ReactCrop
            crop={crop}
            onChange={(_, pct) => setCrop(pct)}
            onComplete={(px) => setCompletedCrop(px)}
            aspect={1}
            minWidth={40}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imgSrc}
              alt="Crop preview"
              onLoad={handleImageLoad}
              style={{ maxHeight: "60vh", maxWidth: "100%", display: "block" }}
            />
          </ReactCrop>
        </div>

        <p className="text-xs text-black/50 text-center -mt-1">
          Drag to reposition · Resize handles to adjust · Output: 512 × 512 px
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={processing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!completedCrop || processing}
            className="bg-[#014421] hover:bg-[#014421]/90 text-white"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Crop & Use"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
