"use client"

import { useEffect } from "react"

/**
 * Last resort, when the root layout itself fails. It replaces that layout,
 * so it renders its own <html> and uses inline styles (the app stylesheet may
 * not be loaded).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fff",
          color: "#000",
          padding: 16,
          textAlign: "center",
        }}
      >
        <div role="alert">
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, margin: "0 0 20px", opacity: 0.7 }}>
            The admin panel could not be loaded. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#014421",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              padding: "10px 16px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
