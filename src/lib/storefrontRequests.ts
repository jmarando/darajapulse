// The media house's side of storefront quote requests: stages, pipeline totals and contact links.

export type RequestStage = "new" | "reviewing" | "quoted" | "won" | "lost";

export type StorefrontRequest = {
  id: string;
  agency_id: string;
  items: { title?: string; kind?: string; deliverable_type?: string | null; platform?: string | null; handle?: string | null }[] | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  company: string | null;
  budget_kes: number | null;
  target_start: string | null;
  target_end: string | null;
  message: string | null;
  status: RequestStage;
  internal_notes: string | null;
  created_at: string;
  updated_at?: string | null;
};

export const STAGES: { key: RequestStage; label: string; hint: string }[] = [
  { key: "new", label: "New", hint: "Reply within a day" },
  { key: "reviewing", label: "Reviewing", hint: "Checking dates and prices" },
  { key: "quoted", label: "Quoted", hint: "Waiting on the client" },
  { key: "won", label: "Won", hint: "Booked" },
  { key: "lost", label: "Lost", hint: "Didn't go ahead" },
];

const OPEN: RequestStage[] = ["new", "reviewing", "quoted"];

/** How many requests sit in each stage, what the open ones are worth on their stated budgets, and what was won. */
export function pipelineSummary(requests: Pick<StorefrontRequest, "status" | "budget_kes">[]) {
  const count = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<RequestStage, number>;
  let openValue = 0;
  let wonValue = 0;
  for (const r of requests) {
    if (r.status in count) count[r.status] += 1;
    const budget = Number(r.budget_kes) || 0;
    if (OPEN.includes(r.status)) openValue += budget;
    if (r.status === "won") wonValue += budget;
  }
  return { count, openValue, wonValue, open: OPEN.reduce((n, s) => n + count[s], 0) };
}

/** A WhatsApp chat link for a phone number as people type it in Kenya (0712…, +254 712…, 254712…). */
export function whatsappUrl(phone?: string | null): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length === 10) digits = `254${digits.slice(1)}`;
  else if (digits.length === 9 && /^[17]/.test(digits)) digits = `254${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

/** "just now", "3 h ago", "yesterday", "4 days ago", or the date. */
export function ago(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
