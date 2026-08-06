import { jsPDF } from "jspdf"

/**
 * Saves a participation card as a PDF: page 1 is the card image, followed by
 * the competition instructions/notes (when present) on subsequent pages.
 */
export function downloadParticipationCardPdf(
  canvas: HTMLCanvasElement,
  opts: {
    eventName: string
    instructions?: string | null
    notes?: string | null
    filename: string
  }
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageW = 210
  const pageH = 297
  const margin = 15
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2

  const ratio = canvas.height / canvas.width
  let imgW = maxW
  let imgH = imgW * ratio
  if (imgH > maxH) {
    imgH = maxH
    imgW = imgH / ratio
  }
  doc.addImage(canvas.toDataURL("image/png"), "PNG", (pageW - imgW) / 2, margin, imgW, imgH)

  const sections = [
    { title: "Instructions", text: opts.instructions },
    { title: "Notes", text: opts.notes },
  ].filter((s) => s.text && s.text.trim())

  if (sections.length) {
    doc.addPage()
    let y = margin + 5
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.text(opts.eventName, margin, y)
    y += 11

    for (const section of sections) {
      if (y > pageH - margin - 12) {
        doc.addPage()
        y = margin + 5
      }
      doc.setFont("helvetica", "bold")
      doc.setFontSize(13)
      doc.text(section.title, margin, y)
      y += 7

      doc.setFont("helvetica", "normal")
      doc.setFontSize(11)
      const lines = doc.splitTextToSize(section.text!.trim(), maxW) as string[]
      for (const line of lines) {
        if (y > pageH - margin) {
          doc.addPage()
          y = margin + 5
        }
        doc.text(line, margin, y)
        y += 5.5
      }
      y += 7
    }
  }

  doc.save(opts.filename)
}
