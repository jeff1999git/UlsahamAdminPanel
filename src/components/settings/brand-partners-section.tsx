"use client"

import { useEffect, useState, useRef } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import { Plus, Trash2, Loader2, Upload, Building2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { addBrandPartnerAction, removeBrandPartnerAction } from "@/actions/settings.actions"
import {
  ACTION_FAILED_MESSAGE,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_MB,
  WEBSITE_UPDATE_NOTE_PARTNERS,
} from "@/constants"

// The cropper (react-image-crop and its CSS) is only needed once a logo file
// has been picked, so it loads on demand.
const LogoCropDialog = dynamic(
  () => import("@/components/settings/logo-crop-dialog").then((m) => m.LogoCropDialog),
  { ssr: false }
)

interface Partner {
  id: string
  name: string
  logoUrl: string
  logoId: string
}

interface BrandPartnersSectionProps {
  partners: Partner[]
}

async function uploadLogoBlob(blob: Blob): Promise<{ url: string; publicId: string }> {
  const formData = new FormData()
  formData.append("file", blob, "logo.png")
  const res = await fetch("/api/admin/upload?folder=brand-partners", {
    method: "POST",
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }))
    throw new Error(err.error ?? "Upload failed")
  }
  return res.json() as Promise<{ url: string; publicId: string }>
}

export function BrandPartnersSection({ partners: initialPartners }: BrandPartnersSectionProps) {
  const [partners, setPartners] = useState<Partner[]>(initialPartners)

  // Add dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  // Crop flow state
  const [rawImgSrc, setRawImgSrc] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null)
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  // The picked file and the cropped logo are shown through object URLs. Each
  // is revoked as soon as it is replaced or cleared, and on unmount, so the
  // browser frees the image instead of holding it for the life of the page.
  const rawUrlRef = useRef<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  function showRawImg(url: string | null) {
    if (rawUrlRef.current && rawUrlRef.current !== url) URL.revokeObjectURL(rawUrlRef.current)
    rawUrlRef.current = url
    setRawImgSrc(url)
  }

  function showPreview(url: string | null) {
    if (previewUrlRef.current && previewUrlRef.current !== url) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url
    setCroppedPreview(url)
  }

  useEffect(
    () => () => {
      if (rawUrlRef.current) URL.revokeObjectURL(rawUrlRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    []
  )

  function resetDialog() {
    setName("")
    setSaving(false)
    showRawImg(null)
    setCropOpen(false)
    setCroppedBlob(null)
    showPreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function handleDialogOpenChange(open: boolean) {
    if (open) {
      // Fetch the cropper while the name is typed, before a logo is picked.
      import("@/components/settings/logo-crop-dialog").catch(() => {})
    } else {
      resetDialog()
    }
    setDialogOpen(open)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Only JPG, PNG, and WEBP images are allowed")
      if (fileRef.current) fileRef.current.value = ""
      return
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be smaller than ${MAX_IMAGE_SIZE_MB}MB`)
      if (fileRef.current) fileRef.current.value = ""
      return
    }

    // The cropper reads the file through an object URL: a data URL would hold
    // up to ~6.7 MB of base64 in state and in the <img>.
    showRawImg(URL.createObjectURL(file))
    setCropOpen(true)
  }

  function handleCropped(blob: Blob, previewUrl: string) {
    setCroppedBlob(blob)
    showPreview(previewUrl)
    setCropOpen(false)
    showRawImg(null)
  }

  function handleCropCancel() {
    setCropOpen(false)
    showRawImg(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function handleRemovePreview() {
    setCroppedBlob(null)
    showPreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleAdd() {
    if (!name.trim()) {
      toast.error("Partner name is required")
      return
    }
    if (!croppedBlob) {
      toast.error("Please upload and crop a logo")
      return
    }

    setSaving(true)
    try {
      const { url, publicId } = await uploadLogoBlob(croppedBlob)
      const result = await addBrandPartnerAction({
        name: name.trim(),
        logoUrl: url,
        logoId: publicId,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setPartners((prev) => [
        ...prev,
        { id: result.data.id, name: name.trim(), logoUrl: url, logoId: publicId },
      ])
      toast.success(`${name.trim()} added as brand partner`, { description: WEBSITE_UPDATE_NOTE_PARTNERS })
      handleDialogOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add partner")
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(partner: Partner) {
    try {
      const result = await removeBrandPartnerAction(partner.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setPartners((prev) => prev.filter((p) => p.id !== partner.id))
      toast.success(`${partner.name} removed`, { description: WEBSITE_UPDATE_NOTE_PARTNERS })
    } catch {
      toast.error(ACTION_FAILED_MESSAGE)
    }
  }

  return (
    <>
      {/* Crop dialog — rendered outside the add-partner dialog to avoid nesting */}
      {rawImgSrc && (
        <LogoCropDialog
          open={cropOpen}
          imgSrc={rawImgSrc}
          onCropped={handleCropped}
          onCancel={handleCropCancel}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Brand Partners</CardTitle>
              <CardDescription>Logos displayed on event pages and materials</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Partner
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Add Brand Partner</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="partner-name">Partner Name *</Label>
                    <Input
                      id="partner-name"
                      placeholder="e.g. Acme Corp"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Logo * <span className="text-black/40 font-normal">(1:1 square, 512×512)</span></Label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={ALLOWED_IMAGE_TYPES.join(",")}
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={saving}
                    />

                    {croppedPreview ? (
                      <div
                        className="relative rounded-lg border overflow-hidden bg-black/5 flex items-center justify-center"
                        style={{ height: 120 }}
                      >
                        <Image
                          src={croppedPreview}
                          alt="Logo preview"
                          fill
                          className="object-contain p-3"
                          unoptimized
                        />
                        {!saving && (
                          <div className="absolute top-2 right-2 flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                handleRemovePreview()
                                // Re-open file picker to pick a new one
                                setTimeout(() => fileRef.current?.click(), 50)
                              }}
                              className="p-1 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors text-xs px-2 flex items-center gap-1"
                              title="Choose different image"
                            >
                              <Upload className="h-3 w-3" />
                              Change
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={saving}
                        className="w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-black/50 hover:border-[#014421] hover:text-[#014421] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ height: 120 }}
                      >
                        <Upload className="h-6 w-6" />
                        <span className="text-xs font-medium">Click to upload logo</span>
                        <span className="text-xs text-black/40">
                          JPG, PNG, WEBP · You&apos;ll crop to 1:1 next
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => handleDialogOpenChange(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAdd}
                    disabled={saving || !name.trim() || !croppedBlob}
                    className="bg-[#014421] hover:bg-[#014421]/90 text-white"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Add Partner"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {partners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-black/40">
              <Building2 className="h-8 w-8 mb-2" />
              <p className="text-sm">No brand partners added yet</p>
              <p className="text-xs mt-1">Click &quot;Add Partner&quot; to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {partners.map((partner) => (
                <div
                  key={partner.id}
                  className="group relative rounded-lg border bg-black/[0.02] p-3 flex flex-col items-center gap-2"
                >
                  <div
                    className="relative w-full bg-white rounded-md overflow-hidden flex items-center justify-center"
                    style={{ height: 72 }}
                  >
                    <Image
                      src={partner.logoUrl}
                      alt={partner.name}
                      fill
                      sizes="160px"
                      className="object-contain p-2"
                    />
                  </div>
                  <p className="text-xs font-medium text-black truncate w-full text-center">
                    {partner.name}
                  </p>
                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        className="absolute top-2 right-2 p-1 rounded-full bg-white border text-black/40 hover:text-red-600 hover:border-red-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                        aria-label={`Remove ${partner.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    }
                    title="Remove Brand Partner"
                    description={`Remove ${partner.name} as a brand partner? This will also delete the logo from storage.`}
                    confirmLabel="Remove"
                    onConfirm={() => handleRemove(partner)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
