"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { Upload, X, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_MB } from "@/constants"

interface MultiImageUploadProps {
  images: { url: string; id: string }[]
  onAdd: (images: { url: string; id: string }[]) => void
  onRemove: (index: number) => void
  disabled?: boolean
  max?: number
  className?: string
}

async function uploadOne(file: File): Promise<{ url: string; publicId: string }> {
  const formData = new FormData()
  formData.append("file", file)
  const res = await fetch("/api/admin/upload", { method: "POST", body: formData })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }))
    throw new Error(err.error ?? "Upload failed")
  }
  return res.json()
}

export function MultiImageUpload({
  images,
  onAdd,
  onRemove,
  disabled,
  max = 10,
  className,
}: MultiImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const remaining = max - images.length

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const maxBytes = MAX_IMAGE_SIZE_MB * 1024 * 1024
    const valid: File[] = []
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: only JPG, PNG, and WEBP images are allowed`)
        continue
      }
      if (file.size > maxBytes) {
        toast.error(`${file.name}: must be smaller than ${MAX_IMAGE_SIZE_MB}MB`)
        continue
      }
      valid.push(file)
    }

    const toUpload = valid.slice(0, remaining)
    if (valid.length > toUpload.length) {
      toast.error(`Only ${max} gallery images allowed — some files were skipped`)
    }
    if (!toUpload.length) {
      if (inputRef.current) inputRef.current.value = ""
      return
    }

    setUploading(true)
    try {
      const results = await Promise.all(toUpload.map(uploadOne))
      onAdd(results.map((r) => ({ url: r.url, id: r.publicId })))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || uploading || remaining <= 0}
        aria-label="Upload gallery images"
      />

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map((img, index) => (
            <div
              key={img.id}
              className="relative aspect-square rounded-lg overflow-hidden border border-black"
            >
              <Image src={img.url} alt={`Gallery image ${index + 1}`} fill className="object-cover" />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
                  aria-label={`Remove gallery image ${index + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className={cn(
            "w-full rounded-lg border-2 border-dashed border-black flex flex-col items-center justify-center gap-2 py-6 text-black hover:border-[#014421] hover:text-[#014421] transition-colors cursor-pointer",
            (disabled || uploading) && "opacity-50 cursor-not-allowed"
          )}
          aria-label="Click to add gallery images"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : images.length > 0 ? (
            <Plus className="h-6 w-6" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium">
              {uploading ? "Uploading..." : "Click to add images"}
            </p>
            <p className="text-xs text-black">
              JPG, PNG, WEBP up to {MAX_IMAGE_SIZE_MB}MB · {remaining} of {max} slots left
            </p>
          </div>
        </button>
      )}
    </div>
  )
}
