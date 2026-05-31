import QRCode from "qrcode"

export async function generateQRCodeBuffer(
  content: string,
  size = 300
): Promise<Buffer> {
  const buffer = await QRCode.toBuffer(content, {
    type: "png",
    width: size,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "H",
  })
  return Buffer.from(buffer)
}
