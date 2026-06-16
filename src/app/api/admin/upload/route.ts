import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { uploadImage } from "@/lib/cloudinary"
import {
  CLOUDINARY_EVENTS_FOLDER,
  CLOUDINARY_BRAND_PARTNERS_FOLDER,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
} from "@/constants"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPG, PNG, and WEBP are allowed." },
        { status: 400 }
      )
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File size must be less than ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const folderParam = request.nextUrl.searchParams.get("folder")
    const folder =
      folderParam === "brand-partners" ? CLOUDINARY_BRAND_PARTNERS_FOLDER : CLOUDINARY_EVENTS_FOLDER

    const { url, publicId } = await uploadImage(buffer, folder)

    return NextResponse.json({ url, publicId })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 })
  }
}
