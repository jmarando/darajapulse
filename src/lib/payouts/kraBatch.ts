// The batch file for KRA's Buyer Initiated Invoicing (eCitizen > KRA Profile > Buyer Initiated Module > Batch Invoices).
// The columns are the ones KRA's manual lists for a batch upload, in that order. Compare them with eCitizen's own
// "Download Sample CSV" before the first real upload, and change KRA_BATCH_HEADERS (and the row in buildKraBatchCsv) to match.
import { isValidIdNumber } from "./details";

export const KRA_BATCH_HEADERS = [
  "Name as per ID", "ID Number", "Phone Number", "Invoice Date", "Item Name", "Quantity", "Unit Price", "Discount", "Total",
] as const;

export interface KraBatchInput {
  payoutId: string;
  legalName: string;
  idNumber: string;
  phone: string; // 254712345678
  grossKes: number;
  itemName: string;
}

/** 254712345678 as 0712345678, the way KRA's file wants the phone. */
export const kraLocalPhone = (msisdn: string) => `0${msisdn.slice(3)}`;

/** DD/MM/YYYY in Nairobi time. */
export const formatKraDate = (when: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "2-digit", year: "numeric" }).format(when);

const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
const amount = (kes: number) => (Number.isInteger(kes) ? String(kes) : kes.toFixed(2));

// Names are typed by creators; one that starts like a formula would run when staff open the file in a spreadsheet.
const looksLikeFormula = (text: string) => /^[=+\-@\t\r]/.test(text);

function whyNot(row: KraBatchInput): string | null {
  if (!(row.grossKes > 0)) return "Nothing to invoice (KES 0)";
  const name = row.legalName.trim();
  if (name === "" || looksLikeFormula(name) || !isValidIdNumber(row.idNumber) || !/^254[71][0-9]{8}$/.test(row.phone)) return "Details incomplete";
  return null;
}

/** The file for the creators who can be invoiced, and who was left out and why. */
export function buildKraBatchCsv(rows: KraBatchInput[], invoiceDate: Date):
  { csv: string; included: string[]; skipped: { payoutId: string; reason: string }[] } {
  const lines = [KRA_BATCH_HEADERS.map(cell).join(",")];
  const included: string[] = [];
  const skipped: { payoutId: string; reason: string }[] = [];
  for (const row of rows) {
    const reason = whyNot(row);
    if (reason) { skipped.push({ payoutId: row.payoutId, reason }); continue; }
    included.push(row.payoutId);
    lines.push([
      row.legalName.trim(), row.idNumber, kraLocalPhone(row.phone), formatKraDate(invoiceDate), row.itemName,
      "1", amount(row.grossKes), "0", amount(row.grossKes),
    ].map(cell).join(","));
  }
  return { csv: lines.join("\r\n"), included, skipped };
}
