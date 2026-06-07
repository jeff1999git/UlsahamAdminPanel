import { env } from "@/lib/env"

export function getCorsHeaders(requestOrigin?: string | null): HeadersInit {
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

export function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)
  const newHeaders = new Headers(response.headers)
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value)
  })
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}
