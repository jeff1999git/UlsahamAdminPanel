import { env } from "@/lib/env"

export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const allowedOrigins = [env.FRONTEND_URL, env.NEXT_PUBLIC_APP_URL].filter(Boolean) as string[]

  const allowedOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] ?? null

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  }

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin
    // The allowed origin is picked from the request's Origin, so any cache in
    // between must keep one copy per Origin.
    headers["Vary"] = "Origin"
  }

  return headers
}

export function corsOptionsResponse(request: Request): Response {
  const origin = request.headers.get("origin")
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  })
}
