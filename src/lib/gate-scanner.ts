import type { IScannerProps, prepareZXingModule } from "@yudiel/react-qr-scanner"

// Shared by the two gate scanners (components/participants/qr-scanner.tsx and
// global-qr-scanner.tsx). The imports above are type-only: the scanner library
// stays in each scanner's next/dynamic chunk, whose loader calls
// selfHostZXingWasm before the first <Scanner> mounts.

// The decoder (zxing-wasm, through barcode-detector) fetches its ~1 MB wasm from
// jsDelivr by default. It is served from public/zxing/ instead, so scanning at
// the gate never depends on a third-party CDN. The wasm must match the JS glue
// bundled from node_modules, so its name carries the installed zxing-wasm
// version, which next.config.ts supplies (and checks the file exists for).
const ZXING_WASM_URL = `/zxing/zxing_reader-${process.env.ZXING_WASM_VERSION}.wasm`

// One object for every call, so a second call (the other scanner's loader)
// matches the stored overrides and keeps the already loaded module.
const zxingOverrides = {
  locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? ZXING_WASM_URL : prefix + path),
}

export function selfHostZXingWasm(lib: { prepareZXingModule: typeof prepareZXingModule }) {
  lib.prepareZXingModule({ overrides: zxingOverrides })
}

/**
 * Detection settings both scanners use. Tickets carry QR codes only, and
 * decoding one format per frame is far cheaper than the default of all of
 * them, which pays for a retry every 150 ms instead of 500 ms.
 * settleDelayMs: 0 drops the library's 500 ms wait after the camera starts;
 * it only lets Safari report the torch capability.
 */
export const GATE_SCANNER_PROPS: Pick<IScannerProps, "formats" | "retryDelay" | "settleDelayMs"> = {
  formats: ["qr_code"],
  retryDelay: 150,
  settleDelayMs: 0,
}
