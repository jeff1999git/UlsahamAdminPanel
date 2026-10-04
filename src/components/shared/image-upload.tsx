"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import Image from "next/image"
import { Upload, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { resizeImageForUpload } from "@/lib/image-resize"
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_MB } from "@/constants"

interface ImageUploadProps {
  value?: string
  onChange: (url: string, publicId: string) => void
  onClear?: () => void
  disabled?: boolean
  className?: string
}

export function ImageUpload({
  value,
  onChange,
  onClear,
  disabled,
  className,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(value ?? null)
  const inputRef = useRef<HTMLInputElement>(null)
  // A picked file previews through an object URL, which stays on screen after
  // the upload. It is revoked when another preview replaces it, when it is
  // cleared and on unmount, so the browser can free the image.
  const objectUrlRef = useRef<string | null>(null)

  const showPreview = useCallback((url: string | null) => {
    const previous = objectUrlRef.current
    if (previous && previous !== url) URL.revokeObjectURL(previous)
    objectUrlRef.current = url?.startsWith("blob:") ? url : null
    setPreview(url)
  }, [])

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    []
  )

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast.error("Only JPG, PNG, and WEBP images are allowed")
        return
      }

      showPreview(URL.createObjectURL(file))
      setUploading(true)

      try {
        // Photos are shrunk first, so the size limit applies to what is sent.
        const upload = await resizeImageForUpload(file)
        if (upload.size > MAX_IMAGE_SIZE_BYTES) {
          throw new Error(`Image must be smaller than ${MAX_IMAGE_SIZE_MB}MB`)
        }

        const formData = new FormData()
        formData.append("file", upload)

        const res = await fetch("/api/admin/upload", {
          method: "POST",
          body: formData,
        })

        // Vercel answers an oversized body itself, without JSON.
        if (res.status === 413) throw new Error("Image too large")
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }))
          throw new Error(err.error ?? "Upload failed")
        }

        const data = await res.json()
        onChange(data.url, data.publicId)
      } catch (error) {
        showPreview(value ?? null)
        toast.error(error instanceof Error ? error.message : "Upload failed")
      } finally {
        setUploading(false)
        if (inputRef.current) inputRef.current.value = ""
      }
    },
    [onChange, value, showPreview]
  )

  function handleClear() {
    showPreview(null)
    if (inputRef.current) inputRef.current.value = ""
    onClear?.()
  }

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || uploading}
        aria-label="Upload event banner image"
      />

      {preview ? (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-black">
          <Image
            src={preview}
            alt="Event banner preview"
            fill
            sizes="(min-width: 1024px) 33vw, 100vw"
            className="object-cover"
            unoptimized={preview.startsWith("blob:")}
          />
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
              aria-label="Remove image"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className={cn(
            "w-full aspect-video rounded-lg border-2 border-dashed border-black flex flex-col items-center justify-center gap-2 text-black hover:border-[#014421] hover:text-[#014421] transition-colors cursor-pointer",
            (disabled || uploading) && "opacity-50 cursor-not-allowed"
          )}
          aria-label="Click to upload image"
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <Upload className="h-8 w-8" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium">
              {uploading ? "Uploading..." : "Click to upload banner image"}
            </p>
            <p className="text-xs text-black">JPG, PNG, WEBP up to {MAX_IMAGE_SIZE_MB}MB</p>
          </div>
        </button>
      )}

      {!preview && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
        >
          <Upload className="h-4 w-4 mr-2" />
          Choose Image
        </Button>
      )}
    </div>
  )
}
