import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import { logoBase64 } from './logo.ts'

export async function agreementPdf(text: string, signer?: string, signedAt?: string, signature?: string | null) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = await pdf.embedPng(Uint8Array.from(atob(logoBase64), c => c.charCodeAt(0)))
  let page = pdf.addPage([595, 842]); let y = 738
  page.drawImage(logo, { x: 195, y: 762, width: 205, height: 50.62 })
  const next = () => { page = pdf.addPage([595, 842]); y = 782 }
  const ascii = (s: string) => s.replace(/[\u2011\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  for (const paragraph of text.split('\n')) {
    const heading = /^\d+\.|^[A-Z &()]+$/.test(paragraph.trim())
    const font = heading ? bold : regular
    const words = ascii(paragraph).split(/\s+/); let line = ''
    const draw = (value: string) => {
      if (y < 70) next()
      page.drawText(value, { x: 56, y, size: 10, font }); y -= 14
    }
    for (const word of words) {
      if (font.widthOfTextAtSize(`${line} ${word}`.trim(), 10) > 483 && line) { draw(line); line = word }
      else line = `${line} ${word}`.trim()
    }
    if (line) draw(line)
    y -= 6
  }
  if (signer && signedAt) {
    if (y < 170) next()
    page.drawText(ascii(`Signed by ${signer}`), { x: 56, y, size: 10, font: bold }); y -= 18
    page.drawText(`Electronic signing date: ${new Date(signedAt).toISOString()}`, { x: 56, y, size: 9, font: regular }); y -= 70
    if (signature) {
      const image = await pdf.embedPng(Uint8Array.from(atob(signature.split(',')[1]), c => c.charCodeAt(0)))
      const size = image.scaleToFit(220, 60)
      page.drawImage(image, { x: 56, y, ...size })
    }
  }
  pdf.getPages().forEach((p, i) => {
    p.drawText('Royco Q3 Nano | Amended term: 16 Sep - 16 Oct 2026', { x: 50, y: 28, size: 8, font: regular })
    p.drawText(`Page ${i + 1}`, { x: 510, y: 28, size: 8, font: regular })
    if (!signedAt) p.drawText('DRAFT SAMPLE FOR REVIEW - NOT SIGNED', { x: 56, y: 820, size: 8, font: bold, color: rgb(.6,.15,.15) })
  })
  return pdf.save()
}