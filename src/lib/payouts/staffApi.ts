// What agency staff call from the dashboard. Kept apart from api.ts on purpose: the creator's page (/b/:token) imports
// api.ts, and the database tells a creator's save from staff's by the absence of a login, so that page must never
// pull in the signed-in staff client. The payout tables are newer than the generated Supabase types, so they are
// reached through the small interfaces below.
import { supabase } from "@/integrations/supabase/client";
import { detailsFromRow, type DetailsLike } from "../../../supabase/functions/_shared/payout-rules";
import type { NormalisedDetails } from "./details";

type DbError = { message?: string };
interface DetailsQuery extends PromiseLike<{ data: Record<string, unknown>[] | null; error: DbError | null }> {
  eq(column: string, value: string): DetailsQuery;
  in(column: string, values: string[]): DetailsQuery;
}
interface DetailsTable {
  select(columns: string): DetailsQuery;
  upsert(row: Record<string, unknown>, options: { onConflict: string }): PromiseLike<{ error: DbError | null }>;
}
const detailsTable = () => (supabase as unknown as { from(table: string): DetailsTable }).from("creator_payout_details");

const fail = (error: DbError) => new Error(error.message || "Something went wrong. Please try again.");

// The ids travel in the request address (about 37 characters each), so a big roster is asked for in batches.
const BATCH = 100;

/** The payout details this agency holds for these creators. */
export async function listPayoutDetails(agencyId: string, influencerIds: string[]): Promise<DetailsLike[]> {
  const batches: string[][] = [];
  for (let i = 0; i < influencerIds.length; i += BATCH) batches.push(influencerIds.slice(i, i + BATCH));
  const replies = await Promise.all(batches.map((ids) => detailsTable().select("*").eq("agency_id", agencyId).in("influencer_id", ids)));
  const failed = replies.find((reply) => reply.error);
  if (failed?.error) throw fail(failed.error);
  return replies.flatMap((reply) => reply.data ?? []).map(detailsFromRow);
}

/**
 * Staff enter or correct a creator's details, for example ones sent on WhatsApp. The database records the row as
 * staff-made, and only the creator's own save sets confirmed_at. Staff tick BII consent on the creator's behalf;
 * a consent time the creator already gave is kept.
 */
export async function saveStaffPayoutDetails(
  agencyId: string,
  influencerId: string,
  v: NormalisedDetails,
  existingConsentAt: string | null = null,
): Promise<void> {
  const { error } = await detailsTable().upsert({
    agency_id: agencyId,
    influencer_id: influencerId,
    mpesa_number: v.mpesaNumber,
    mpesa_name: v.mpesaName,
    kra_pin: v.kraPin,
    legal_name: v.legalName,
    id_number: v.idNumber,
    vat_registered: v.vatRegistered,
    bii_consent_at: v.biiConsent ? (existingConsentAt ?? new Date().toISOString()) : null,
  }, { onConflict: "agency_id,influencer_id" });
  if (error) throw fail(error);
}

interface UpdateQuery extends PromiseLike<{ error: DbError | null }> {
  eq(column: string, value: string): UpdateQuery;
  in(column: string, values: string[]): UpdateQuery;
  select(columns: string): PromiseLike<{ data: { id: string }[] | null; error: DbError | null }>;
}
const updatable = (table: string) =>
  (supabase as unknown as { from(table: string): { update(values: Record<string, unknown>): UpdateQuery } }).from(table);

// Each invoice change names the state it starts from, so a page left open can't undo what someone else recorded since.
const NO_LIVE_INVOICE = ["not_raised", "declined", "expired"];
const STALE = "This invoice changed since the page loaded. Refresh the page and try again.";

/**
 * Staff are taking these payouts' batch file to KRA: they are now invoiced through Buyer Initiated Invoicing, with no
 * earlier decision. Only payouts that still have no live invoice are marked; returns the ids that were.
 */
export async function markInvoicesRaised(payoutIds: string[]): Promise<string[]> {
  const { data, error } = await updatable("payouts").update({
    invoice_route: "bii",
    invoice_status: "raised",
    invoice_raised_at: new Date().toISOString(),
    invoice_decided_at: null,
    invoice_number: null,
    invoice_file_path: null,
  }).in("id", payoutIds).in("invoice_status", NO_LIVE_INVOICE).select("id");
  if (error) throw fail(error);
  return (data ?? []).map((row) => row.id);
}

export type InvoiceDecision =
  | { status: "approved"; invoiceNumber: string; decidedAt: string }
  | { status: "declined" | "expired"; decidedAt: string };

/** What KRA (or the creator's own invoice check) decided: approved with the eTIMS invoice number, declined, or expired. */
export async function recordInvoiceDecision(payoutId: string, d: InvoiceDecision): Promise<void> {
  const values = d.status === "approved"
    ? { invoice_status: d.status, invoice_number: d.invoiceNumber, invoice_decided_at: d.decidedAt }
    : { invoice_status: d.status, invoice_decided_at: d.decidedAt };
  const { data, error } = await updatable("payouts").update(values).eq("id", payoutId).eq("invoice_status", "raised").select("id");
  if (error) throw fail(error);
  if (!data?.length) throw new Error(STALE);
}

/**
 * A creator issued their own eTIMS invoice (the route for VAT-registered creators). The file, if there is one, goes to the
 * private bucket under the agency and payout; the payout is then raised on the creator route, waiting for staff to check it.
 */
export async function recordCreatorInvoice(payoutId: string, agencyId: string, file: File | null, invoiceNumber: string): Promise<void> {
  let path: string | null = null;
  if (file) {
    path = `${agencyId}/${payoutId}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("payout-invoices").upload(path, file, { contentType: file.type || undefined });
    if (uploadError) throw fail(uploadError);
  }
  const { data, error } = await updatable("payouts").update({
    invoice_route: "creator",
    invoice_status: "raised",
    invoice_number: invoiceNumber,
    invoice_raised_at: new Date().toISOString(),
    invoice_decided_at: null,
    invoice_file_path: path,
  }).eq("id", payoutId).in("invoice_status", NO_LIVE_INVOICE).select("id");
  if (error) throw fail(error);
  if (!data?.length) throw new Error(STALE);
}

/** Days after both approvals that this campaign's creators become payable (Royco: 45), or null for none. */
export async function setPaymentTerms(campaignId: string, days: number | null): Promise<void> {
  const { error } = await updatable("campaigns").update({ payment_terms_days: days }).eq("id", campaignId);
  if (error) throw fail(error);
}

/** Move a payout's report approval date to a calendar day (YYYY-MM-DD). Stored at noon in Nairobi so the day can't slip. */
export async function setReportApprovedAt(payoutId: string, day: string): Promise<void> {
  const { error } = await updatable("payouts").update({ report_approved_at: `${day}T12:00:00+03:00` }).eq("id", payoutId);
  if (error) throw fail(error);
}
