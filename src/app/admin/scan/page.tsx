import { GlobalQRScanner } from "@/components/participants/global-qr-scanner"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "QR Scanner" }

export default function ScanPage() {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-black">QR Scanner</h1>
        <p className="text-black text-sm mt-1">Scan any participant ticket to mark attendance</p>
      </div>
      <GlobalQRScanner />
    </div>
  )
}
