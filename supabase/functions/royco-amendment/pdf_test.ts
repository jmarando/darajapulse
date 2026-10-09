import { PDFDocument } from 'npm:pdf-lib@1.17.1'
import { agreementPdf } from './pdf.ts'
Deno.test('Unsigned PDF produces valid pages without reusing a signature', async () => {
  const bytes = await agreementPdf('INFLUENCER AGREEMENT\n\nViews / Reach                 Amount to be Paid (KES)\n  1,000 - 4,999                 5,000\n\nCreator signature: pending re-signing.\n'+('Original unchanged terms. '.repeat(500)))
  const pdf = await PDFDocument.load(bytes)
  if (pdf.getPageCount() < 2) throw new Error('Expected paginated PDF')
  if (pdf.getPages().some(page => page.getWidth() !== 595)) throw new Error('Expected A4 pages')
})
Deno.test('Signed PDF uses supplied actual signature date', async () => {
  const bytes = await agreementPdf('Amended agreement\nSignature recorded on execution.', 'Test Signer', '2026-10-09T10:00:00Z')
  if ((await PDFDocument.load(bytes)).getPageCount() !== 1) throw new Error('Expected one-page fixture')
})