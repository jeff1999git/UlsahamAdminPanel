/**
 * Bundle budget check. Run after `npm run build`; it reads only .next/.
 *
 *   npm run check:bundle
 *
 * For every page it sums the gzip size of the JavaScript a first visit loads:
 * the page's chunks from app-build-manifest.json plus those of every layout,
 * template, error, loading and not-found file above it, and the root main files
 * from build-manifest.json. Polyfills are left out: they load only in browsers
 * without ES module support. The total is a little larger than Next's "First
 * Load JS" column, which counts the page entry alone.
 *
 * It fails when
 *  - a page exceeds its budget (about 5% above the build it was set from);
 *  - the participants page's first load contains SheetJS or jsPDF, which must
 *    load only when an export or a participation card is asked for;
 *  - any page other than the two scan pages references zxing (the scanner).
 *
 * After a deliberate size change, raise the budget here in the same commit.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { gzipSync } from "node:zlib"

// gzip KB (1 KB = 1000 bytes, as in Next's build output): the 3 Oct 2026
// build (in the comment) plus about 5%.
const BUDGETS_KB = {
  // Lowered when the login form dropped react-hook-form/zod and the Toaster
  // moved from the root layout to the admin layout.
  "/": 109, // 103.8
  "/_not-found": 110, // 104.6
  "/login": 126, // 119.8
  "/admin/dashboard": 145, // 137.6
  "/admin/events": 166, // 158.0
  "/admin/events/new": 218, // 207.6
  "/admin/events/[id]/edit": 224, // 213.2
  "/admin/events/[id]/participants": 178, // 168.9
  "/admin/events/[id]/scan": 152, // 143.9
  "/admin/scan": 153, // 144.8
  "/admin/logs": 163, // 154.8
  "/admin/settings": 196, // 185.9
  "/admin/admins": 217, // 206.0
}
// A page added since the budgets were set gets the largest one until it has its own.
const DEFAULT_BUDGET_KB = Math.max(...Object.values(BUDGETS_KB))

const PARTICIPANTS = "/admin/events/[id]/participants"
const HEAVY_LIBRARIES = [
  { name: "SheetJS (xlsx)", pattern: /SheetJS|XLSX\.version/ },
  { name: "jsPDF", pattern: /%PDF-/ },
]
const SCANNER_PAGES = new Set(["/admin/scan", "/admin/events/[id]/scan"])
const ZXING = /zxing/i

const SEGMENT_FILES = ["layout", "template", "error", "loading", "not-found"]

const nextDir = path.join(process.cwd(), ".next")
const appManifestPath = path.join(nextDir, "app-build-manifest.json")
const buildManifestPath = path.join(nextDir, "build-manifest.json")
if (!existsSync(appManifestPath) || !existsSync(buildManifestPath)) {
  console.error("No build found in .next/: run `npm run build` first.")
  process.exit(1)
}
const appManifest = JSON.parse(readFileSync(appManifestPath, "utf8"))
const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8"))

const fileCache = new Map()
function readChunk(file) {
  let entry = fileCache.get(file)
  if (!entry) {
    const content = readFileSync(path.join(nextDir, file))
    entry = { text: content.toString("utf8"), gzip: gzipSync(content, { level: 9 }).length }
    fileCache.set(file, entry)
  }
  return entry
}

const jsOnly = (files) => (files ?? []).filter((file) => file.endsWith(".js"))

/** "/(auth)/login/page" -> "/login"; "/page" -> "/". */
function routeOf(entry) {
  const segments = entry.split("/").slice(1, -1).filter((s) => !(s.startsWith("(") && s.endsWith(")")))
  return "/" + segments.join("/")
}

/** Every JS file a first visit to this page entry loads. */
function firstLoadFiles(entry) {
  const segments = entry.split("/").slice(1, -1)
  const files = new Set(jsOnly(buildManifest.rootMainFiles))
  for (let depth = 0; depth <= segments.length; depth++) {
    const prefix = segments.slice(0, depth).map((s) => "/" + s).join("")
    for (const name of SEGMENT_FILES) {
      for (const file of jsOnly(appManifest.pages[`${prefix}/${name}`])) files.add(file)
    }
  }
  for (const file of jsOnly(appManifest.pages[entry])) files.add(file)
  return [...files]
}

const kb = (bytes) => (bytes / 1000).toFixed(1)
const failures = []
const rows = []

const pageEntries = Object.keys(appManifest.pages)
  .filter((entry) => entry.endsWith("/page"))
  .sort((a, b) => routeOf(a).localeCompare(routeOf(b)))
for (const entry of pageEntries) {
  const route = routeOf(entry)
  const files = firstLoadFiles(entry)
  const total = files.reduce((sum, file) => sum + readChunk(file).gzip, 0)
  const budgetKb = BUDGETS_KB[route] ?? DEFAULT_BUDGET_KB
  const overBudget = total > budgetKb * 1000
  rows.push({ route, total, budgetKb, isDefault: !(route in BUDGETS_KB), overBudget })
  if (overBudget) failures.push(`${route}: ${kb(total)} KB gzip is over its ${budgetKb} KB budget`)

  if (route === PARTICIPANTS) {
    for (const { name, pattern } of HEAVY_LIBRARIES) {
      const holders = files.filter((file) => pattern.test(readChunk(file).text))
      if (holders.length) failures.push(`${route}: first load contains ${name} (${holders.join(", ")})`)
    }
  }
  if (!SCANNER_PAGES.has(route)) {
    const holders = files.filter((file) => ZXING.test(readChunk(file).text))
    if (holders.length) failures.push(`${route}: first load references zxing (${holders.join(", ")})`)
  }
}

if (!rows.some((row) => row.route === PARTICIPANTS)) {
  failures.push(`${PARTICIPANTS}: not found in app-build-manifest.json`)
}

const width = Math.max(...rows.map((row) => row.route.length))
console.log(`${"Page".padEnd(width)}  First load (gzip)   Budget`)
for (const row of rows) {
  const budget = `${row.budgetKb} KB${row.isDefault ? " (default)" : ""}`
  const flag = row.overBudget ? "  OVER" : ""
  console.log(`${row.route.padEnd(width)}  ${(kb(row.total) + " KB").padStart(17)}   ${budget}${flag}`)
}

if (failures.length) {
  console.error(`\nBundle check failed:\n- ${failures.join("\n- ")}`)
  process.exit(1)
}
console.log("\nBundle check passed.")
