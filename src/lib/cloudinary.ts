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

export async function uploadPngBuffer(
  buffer: Buffer,
  folder: string,
  publicId: string
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: "image",
          format: "png",
          overwrite: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Cloudinary upload failed"))
            return
          }
          resolve({ url: result.secure_url, publicId: result.public_id })
        }
      )
      .end(buffer)
  })
}

export async function deleteImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId)
  } catch {
    // Non-fatal: log but don't throw
    console.error(`Failed to delete Cloudinary image: ${publicId}`)
  }
}
