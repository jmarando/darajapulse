// What a creator (or staff on their behalf) types to get paid: M-Pesa line,
// KRA PIN and ID details for the eTIMS invoice KRA raises in their name.

export interface DetailsInput {
  mpesaNumber: string;
  mpesaNumberConfirm: string;
  mpesaName: string;
  kraPin: string;
  legalName: string;
  idNumber: string;
  vatRegistered: boolean;
  biiConsent: boolean;
}

export interface NormalisedDetails {
  mpesaNumber: string;
  mpesaName: string;
  kraPin: string;
  legalName: string;
  idNumber: string;
  vatRegistered: boolean;
  biiConsent: boolean;
}

/** Any Safaricom-style shape (0712…, +254 712…, 712…) as 2547XXXXXXXX / 2541XXXXXXXX, else null. */
export function normaliseKenyanMobile(input: string): string | null {
  if (/[^\d\s+\-().]/.test(input)) return null;
  const digits = input.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("254") ? digits.slice(3)
    : digits.length === 10 && digits.startsWith("0") ? digits.slice(1)
    : digits.length === 9 ? digits
    : null;
  return local && /^[71][0-9]{8}$/.test(local) ? `254${local}` : null;
}

export const normaliseKraPin = (input: string) => input.trim().toUpperCase();
export const isValidKraPin = (pin: string) => /^A[0-9]{9}[A-Z]$/.test(pin);
export const isValidIdNumber = (id: string) => /^[0-9]{7,8}$/.test(id);
export const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");

export function validateDetailsInput(i: DetailsInput):
  | { ok: true; value: NormalisedDetails }
  | { ok: false; errors: Partial<Record<keyof DetailsInput, string>> } {
  const errors: Partial<Record<keyof DetailsInput, string>> = {};
  const mpesaNumber = normaliseKenyanMobile(i.mpesaNumber);
  const mpesaName = cleanName(i.mpesaName);
  const kraPin = normaliseKraPin(i.kraPin);
  const legalName = cleanName(i.legalName);
  const idNumber = i.idNumber.replace(/\s+/g, "");

  if (!mpesaNumber) errors.mpesaNumber = "Enter an M-Pesa (Safaricom) number, like 0712 345 678";
  else if (normaliseKenyanMobile(i.mpesaNumberConfirm) !== mpesaNumber) errors.mpesaNumberConfirm = "The two numbers don't match";
  if (!mpesaName) errors.mpesaName = "Enter the name registered on this M-Pesa line";
  if (!isValidKraPin(kraPin)) errors.kraPin = "Enter your KRA PIN, like A123456789Z";
  if (legalName.split(" ").length < 2) errors.legalName = "Enter your full name as it appears on your ID";
  if (!isValidIdNumber(idNumber)) errors.idNumber = "Enter your ID number (7 or 8 digits)";
  if (!i.vatRegistered && !i.biiConsent) errors.biiConsent = "Tick the box so your eTIMS invoice can be raised for you";

  if (Object.keys(errors).length > 0 || !mpesaNumber) return { ok: false, errors };
  return {
    ok: true,
    value: { mpesaNumber, mpesaName, kraPin, legalName, idNumber, vatRegistered: i.vatRegistered, biiConsent: !i.vatRegistered && i.biiConsent },
  };
}
