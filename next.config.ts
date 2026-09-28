import type { NextConfig } from "next"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// The gate scanners load zxing's wasm from public/zxing/ rather than jsDelivr
// (src/lib/gate-scanner.ts). It has to match the zxing-wasm JS bundled from
// node_modules, so the file is named with the installed zxing-wasm version,
// which is passed to the client below. After an upgrade that moves zxing-wasm,
// copy node_modules/zxing-wasm/dist/reader/zxing_reader.wasm to the new name;
// until then the build stops here instead of shipping a scanner that cannot decode.
const zxingWasmVersion: string = JSON.parse(
  readFileSync(path.join(process.cwd(), "node_modules/zxing-wasm/package.json"), "utf8")
).version
const zxingWasmFile = `public/zxing/zxing_reader-${zxingWasmVersion}.wasm`
if (!existsSync(path.join(process.cwd(), zxingWasmFile))) {
  throw new Error(
    `${zxingWasmFile} is missing: copy node_modules/zxing-wasm/dist/reader/zxing_reader.wasm there and delete the old copy.`
  )
}

// The image optimizer is public, so it only accepts images from this app's own
// Cloudinary account (the one uploads go to); otherwise anyone could spend the
// image quota on another account's files. Any Cloudinary path is accepted only
// when the cloud name is missing at build time.
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const cloudinaryPathname = cloudName && /^[A-Za-z0-9_-]+$/.test(cloudName) ? `/${cloudName}/**` : "/**"

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    ZXING_WASM_VERSION: zxingWasmVersion,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: cloudinaryPathname,
      },
    ],
    qualities: [75],
    // Keep optimized variants for 31 days. Uploads get new Cloudinary URLs and
    // local assets use versioned names (brand_logo_440.avif), so none go stale.
    minimumCacheTTL: 2678400,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "0" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        // The scanner wasm's name carries its version, so browsers may keep it.
        source: "/zxing/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ]
  },
}

export default nextConfig
