import QRCode from "qrcode"

export async function generateQRCodeBuffer(
  content: string,
  size = 300
): Promise<Buffer> {
  try {
    return QRCode.toBuffer(content, {
      type: "png",
      width: size,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "H",
    })
  } catch (error) {
    throw new Error(`QR code generation failed: ${error instanceof Error ? error.message : "unknown error"}`)
  }
}
