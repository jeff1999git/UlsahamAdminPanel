import { generateQRCodeBuffer } from "@/lib/qrcode"
import { uploadPngBuffer } from "@/lib/cloudinary"
import { CLOUDINARY_QRCODES_FOLDER } from "@/constants"

export async function generateAndUploadQRCode(ticketCode: string): Promise<{
  qrCodeUrl: string
  qrCodeImageId: string
}> {
  const buffer = await generateQRCodeBuffer(ticketCode, 300)

  const safePublicId = ticketCode.replace(/[^A-Z0-9-]/g, "_")
  const { url, publicId } = await uploadPngBuffer(
    buffer,
    CLOUDINARY_QRCODES_FOLDER,
    safePublicId
  )

  return { qrCodeUrl: url, qrCodeImageId: publicId }
}
