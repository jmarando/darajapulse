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
