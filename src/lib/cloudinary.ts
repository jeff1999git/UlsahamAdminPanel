import { v2 as cloudinary } from "cloudinary"
import { env } from "@/lib/env"

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
})

export { cloudinary }

export async function uploadImage(
  buffer: Buffer,
  folder: string,
  publicId?: string
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const uploadOptions: Record<string, unknown> = {
      folder,
      resource_type: "image" as const,
      format: "webp",
      quality: "auto:good",
      fetch_format: "auto",
    }
    if (publicId) uploadOptions.public_id = publicId

    cloudinary.uploader
      .upload_stream(uploadOptions, (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"))
          return
        }
        resolve({ url: result.secure_url, publicId: result.public_id })
      })
      .end(buffer)
  })
}

/**
 * Deletes an image and invalidates its CDN copies, so no edge keeps serving
 * it. True once the image is gone (deleted now, or already missing); false
 * when Cloudinary could not do it, so the caller can try again later. Never
 * throws.
 */
export async function deleteImage(publicId: string): Promise<boolean> {
  try {
    const reply = (await cloudinary.uploader.destroy(publicId, { invalidate: true })) as { result?: unknown } | undefined
    if (reply?.result === "ok" || reply?.result === "not found") return true
    console.error(`Cloudinary did not delete image ${publicId}:`, reply?.result)
    return false
  } catch (error) {
    console.error(`Failed to delete Cloudinary image ${publicId}:`, error)
    return false
  }
}
