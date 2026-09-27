/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * Uploads pass through a Vercel function (4.5 MB request limit) and staff
 * often upload straight from a phone over mobile data, so JPEG and WebP photos
 * are scaled until the long edge is at most MAX_EDGE px and re-encoded as JPEG.
 * PNGs are sent untouched: they may be logos whose transparency JPEG would
 * flatten. Anything that cannot be decoded is also sent as it is, and the
 * size limit still applies to whatever is returned.
 */

const MAX_EDGE = 2400
const JPEG_QUALITY = 0.85
const RESIZABLE_TYPES = ["image/jpeg", "image/webp"]

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void }

async function decode(file: File): Promise<Decoded> {
  // "from-image" draws the photo upright per its EXIF orientation. Browsers
  // that reject the option fall back to an <img>, which is also drawn upright.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // fall through to <img>
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = document.createElement("img")
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function resize(file: File): Promise<File> {
  if (!RESIZABLE_TYPES.includes(file.type)) return file

  let decoded: Decoded
  try {
    decoded = await decode(file)
  } catch {
    return file
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return file

    // JPEG has no alpha: paint white first so transparent WebP areas do not turn black.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(decoded.source, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    )
    // Keep the original when re-encoding does not make it smaller.
    if (!blob || blob.type !== "image/jpeg" || blob.size >= file.size) return file

    const name = `${file.name.replace(/\.[^.]*$/, "") || "image"}.jpg`
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    decoded.release()
  }
}

// One photo at a time: a phone can run out of memory decoding several camera
// images at once. Uploads themselves still run in parallel.
let queue: Promise<unknown> = Promise.resolve()

export function resizeImageForUpload(file: File): Promise<File> {
  const next = queue.then(() => resize(file))
  queue = next.catch(() => {})
  return next
}
