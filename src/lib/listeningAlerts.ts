/** The most addresses a brand's alert list may hold. The table refuses more. */
export const MAX_RECIPIENTS = 10;

// The test the alert function applies before it sends, with angle brackets refused too: a pasted
// "Name <address>" is caught here instead of being saved as an address no mail server will take.
const ADDRESS = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

/**
 * The text a person types or pastes into the alert list, as a clean list: split on commas, semicolons,
 * spaces and new lines, lowercased, each address once. What is not an address comes back as typed, so it
 * can be named. `tooMany` is set past MAX_RECIPIENTS.
 */
export function parseRecipients(text: string): { emails: string[]; invalid: string[]; tooMany: boolean } {
  const emails = new Set<string>();
  const invalid: string[] = [];
  for (const piece of text.split(/[\s,;]+/).filter(Boolean)) {
    const address = piece.toLowerCase();
    if (ADDRESS.test(address)) emails.add(address);
    else invalid.push(piece);
  }
  return { emails: [...emails], invalid, tooMany: emails.size > MAX_RECIPIENTS };
}
