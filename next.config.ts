import type { NextConfig } from "next"

// The image optimizer is public, so it only accepts images from this app's own
// Cloudinary account (the one uploads go to); otherwise anyone could spend the
// image quota on another account's files. Any Cloudinary path is accepted only
// when the cloud name is missing at build time.
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const cloudinaryPathname = cloudName && /^[A-Za-z0-9_-]+$/.test(cloudName) ? `/${cloudName}/**` : "/**"

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
    ]
  },
}

export default nextConfig
