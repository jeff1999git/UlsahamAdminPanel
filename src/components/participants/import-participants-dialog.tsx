"use client"

import { useState, useRef } from "react"
import * as XLSX from "xlsx"
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { bulkAddParticipantsAction } from "@/actions/participant.actions"
import type { BulkImportResult } from "@/actions/participant.actions"
import { participantSchema } from "@/validators/participant.validator"

interface ParsedRow {
  row: number
  name: string
  phone: string
  email: string
  age: number
  numberOfParticipants: number
  valid: boolean
  error?: string
}

interface ImportParticipantsDialogProps {
  eventId: string
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const headers = ["Name", "Phone", "Email (optional)", "Age", "Number of Participants"]
  const sample = [
    ["John Doe", "9876543210", "john@example.com", 25, 2],
    ["Jane Smith", "9876543211", "", 30, 1],
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
  ws["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 8 }, { wch: 24 }]
  XLSX.utils.book_append_sheet(wb, ws, "Participants")
  XLSX.writeFile(wb, "participants-template.xlsx")
}

function parseRow(rawRow: Record<string, unknown>, rowIndex: number): ParsedRow {
  const name = String(rawRow["Name"] ?? rawRow["name"] ?? "").trim()
  const rawPhone = String(rawRow["Phone"] ?? rawRow["phone"] ?? "").trim()
  // Strip non-digits but keep it as-is for validation (don't silently truncate)
  const phone = rawPhone.replace(/\D/g, "")
  const email = String(
    rawRow["Email (optional)"] ?? rawRow["Email"] ?? rawRow["email"] ?? ""
  ).trim()
  const age = rawRow["Age"] ?? rawRow["age"]
  const numberOfParticipants =
    rawRow["Number of Participants"] ??
    rawRow["Participants"] ??
    rawRow["participants"] ??
    1

  const parsed = participantSchema.safeParse({
    name,
    phone,
    email: email || undefined,
    age,
    numberOfParticipants,
  })

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    const first = Object.values(errors)[0]?.[0]
    return {
      row: rowIndex,
      name,
      phone,
      email,
      age: Number(age) || 0,
      numberOfParticipants: Number(numberOfParticipants) || 1,
      valid: false,
      error: first ?? "Invalid data",
    }
  }

  return {
    row: rowIndex,
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: email,
    age: parsed.data.age,
    numberOfParticipants: parsed.data.numberOfParticipants,
    valid: true,
  }
}

export function ImportParticipantsDialog({ eventId }: ImportParticipantsDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload")
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<BulkImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep("upload")
    setParsedRows([])
    setResult(null)
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    setOpen(next)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: "array" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)

        if (rows.length === 0) {
          toast.error("The file appears to be empty or has no data rows")
          return
        }

        setParsedRows(rows.map((row, i) => parseRow(row, i + 1)))
        setStep("preview")
      } catch {
        toast.error("Could not read the file. Make sure it's a valid .xlsx file.")
        if (fileRef.current) fileRef.current.value = ""
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    const validRows = parsedRows.filter((r) => r.valid)
    if (validRows.length === 0) return

    setImporting(true)
    try {
      const res = await bulkAddParticipantsAction(eventId, validRows)
      if (res.success) {
        setResult(res.data)
        setStep("result")
      } else {
        toast.error(res.error ?? "Import failed")
      }
    } finally {
      setImporting(false)
    }
  }

  const validCount = parsedRows.filter((r) => r.valid).length
  const invalidCount = parsedRows.filter((r) => !r.valid).length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Import Excel
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Participants from Excel</DialogTitle>
          {step === "upload" && (
            <DialogDescription>
              Upload an .xlsx file with participant data. Use the template below to get the correct format.
            </DialogDescription>
          )}
          {step === "preview" && (
            <DialogDescription>
              Review the parsed rows before importing. Invalid rows will be skipped.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <button
              type="button"
              className="w-full rounded-lg border-2 border-dashed p-8 text-center space-y-3 hover:bg-black/[0.02] transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-black/30" />
              <div>
                <p className="text-sm font-medium">Click to choose an Excel file</p>
                <p className="text-xs text-black/50 mt-1">Supports .xlsx files only</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleFile}
              />
            </button>

            <div className="rounded-lg bg-black/5 p-4 space-y-2">
              <p className="text-xs font-medium text-black/60">Required columns</p>
              <div className="flex flex-wrap gap-1.5">
                {["Name", "Phone", "Age", "Number of Participants"].map((col) => (
                  <span
                    key={col}
                    className="text-xs bg-white border rounded px-2 py-0.5 font-mono"
                  >
                    {col}
                  </span>
                ))}
                <span className="text-xs bg-white border border-dashed rounded px-2 py-0.5 font-mono text-black/40">
                  Email (optional)
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-[#014421] hover:text-[#014421] hover:bg-[#014421]/5"
              onClick={downloadTemplate}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                <CheckCircle2 className="h-3 w-3" />
                {validCount} valid
              </span>
              {invalidCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5">
                  <XCircle className="h-3 w-3" />
                  {invalidCount} invalid
                </span>
              )}
              <span className="text-xs text-black/40">{parsedRows.length} rows total</span>
            </div>

            <ScrollArea className="h-64 rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b z-10">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium text-black/50 w-8">#</th>
                    <th className="px-3 py-2 font-medium text-black/50">Name</th>
                    <th className="px-3 py-2 font-medium text-black/50">Phone</th>
                    <th className="px-3 py-2 font-medium text-black/50 w-12">Age</th>
                    <th className="px-3 py-2 font-medium text-black/50 w-14">Guests</th>
                    <th className="px-3 py-2 font-medium text-black/50">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsedRows.map((row) => (
                    <tr key={row.row} className={row.valid ? "" : "bg-red-50/40"}>
                      <td className="px-3 py-2 text-black/40">{row.row}</td>
                      <td className="px-3 py-2 font-medium">
                        {row.name || <span className="text-black/30 font-normal">—</span>}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {row.phone || <span className="text-black/30 font-sans">—</span>}
                      </td>
                      <td className="px-3 py-2">{row.age || "—"}</td>
                      <td className="px-3 py-2">{row.numberOfParticipants}</td>
                      <td className="px-3 py-2">
                        {row.valid ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <span className="flex items-start gap-1 text-red-600">
                            <XCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                            <span>{row.error}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            {invalidCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-px" />
                <p className="text-xs text-amber-700">
                  {invalidCount} row{invalidCount !== 1 ? "s" : ""} will be skipped due to
                  validation errors. Only {validCount} valid row
                  {validCount !== 1 ? "s" : ""} will be imported.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Result */}
        {step === "result" && result && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border bg-green-50 border-green-200 p-4">
                <p className="text-2xl font-bold text-green-700">{result.added}</p>
                <p className="text-xs text-green-600 mt-1">Added</p>
              </div>
              <div className="rounded-lg border bg-amber-50 border-amber-200 p-4">
                <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
                <p className="text-xs text-amber-600 mt-1">Duplicate (skipped)</p>
              </div>
              <div className="rounded-lg border bg-red-50 border-red-200 p-4">
                <p className="text-2xl font-bold text-red-700">{result.errors.length}</p>
                <p className="text-xs text-red-600 mt-1">Failed</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg border p-3 space-y-1.5 max-h-36 overflow-y-auto">
                <p className="text-xs font-medium text-black/60">Failed rows</p>
                {result.errors.map((e) => (
                  <p key={e.row} className="text-xs text-red-600">
                    Row {e.row}{e.name ? ` · ${e.name}` : ""}: {e.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset} disabled={importing}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={validCount === 0 || importing}
                className="bg-[#014421] hover:bg-[#014421]/90 text-white"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${validCount} Participant${validCount !== 1 ? "s" : ""}`
                )}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button
              onClick={() => handleOpenChange(false)}
              className="bg-[#014421] hover:bg-[#014421]/90 text-white"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
