import { jsPDF } from "jspdf"

const GREEN = "#014421"

export type ParticipationCardData = {
  chestNumber: number
  participantName: string
  eventName: string
  eventDate: string
  eventVenue: string
  numberOfParticipants: number
  ticketCode: string
  instructions?: string | null
  notes?: string | null
}

/**
 * Generates the competition participation card as a plain-document PDF:
 * chest number + participant/event details written out, followed by the
 * competition instructions/notes when present. No ticket artwork.
 */
export function downloadParticipationCardPdf(data: ParticipationCardData, filename: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageW = 210
  const pageH = 297
  const margin = 18
  const maxW = pageW - margin * 2
  let y = margin + 4

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage()
      y = margin + 4
    }
  }

  // Header
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(GREEN)
  doc.text("ULSAHAM ENTERTAINMENTS", pageW / 2, y, { align: "center" })
  y += 10

  doc.setFontSize(22)
  doc.setTextColor("#000000")
  doc.text("PARTICIPATION CARD", pageW / 2, y, { align: "center" })
  y += 6

  doc.setDrawColor(200)
  doc.line(margin, y, pageW - margin, y)
  y += 13

  // Chest number
  doc.setFontSize(12)
  doc.setTextColor("#666666")
  doc.text("CHEST NO", pageW / 2, y, { align: "center" })
  y += 21
  doc.setFontSize(56)
  doc.setTextColor(GREEN)
  doc.text(String(data.chestNumber), pageW / 2, y, { align: "center" })
  y += 9

  doc.setDrawColor(200)
  doc.line(margin, y, pageW - margin, y)
  y += 10

  // Details
  const entryLabel =
    data.numberOfParticipants > 1 ? `Group — ${data.numberOfParticipants} members` : "Individual"
  const rows: Array<[string, string]> = [
    ["Participant", data.participantName],
    ["Event", data.eventName],
    ["Date", data.eventDate],
    ["Venue", data.eventVenue],
    ["Entry", entryLabel],
    ["Reference Code", data.ticketCode],
  ]

  doc.setFontSize(11)
  for (const [label, value] of rows) {
    const isCode = label === "Reference Code"
    const valueLines = doc.splitTextToSize(value ?? "", maxW - 45) as string[]
    ensureSpace(7 * valueLines.length)
    doc.setFont("helvetica", "bold")
    doc.setTextColor("#555555")
    doc.text(label, margin, y)
    doc.setFont(isCode ? "courier" : "helvetica", isCode ? "bold" : "normal")
    doc.setTextColor("#111111")
    doc.text(valueLines, margin + 45, y)
    y += 7 * valueLines.length
  }
  y += 4

  // Instructions / Notes
  const sections = [
    { title: "Instructions", text: data.instructions },
    { title: "Notes", text: data.notes },
  ].filter((s) => s.text && s.text.trim())

  for (const section of sections) {
    ensureSpace(18)
    doc.setDrawColor(200)
    doc.line(margin, y, pageW - margin, y)
    y += 9
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.setTextColor(GREEN)
    doc.text(section.title, margin, y)
    y += 7
    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    doc.setTextColor("#222222")
    const lines = doc.splitTextToSize(section.text!.trim(), maxW) as string[]
    for (const line of lines) {
      ensureSpace(6)
      doc.text(line, margin, y)
      y += 5.5
    }
    y += 4
  }

  // Footer
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor("#777777")
  doc.text("Contact: 9446266011  ·  Instagram: @ulsaham_", pageW / 2, pageH - 10, { align: "center" })

  doc.save(filename)
}
