// Every payouts RPC, table and function call goes through this file. The payout tables and RPCs are
// newer than the generated Supabase types, so they are reached through `as any` here and nowhere else.
import { publicSupabase } from "@/integrations/supabase/publicClient";
import type { NormalisedDetails } from "./details";
import type { InvoiceRoute, InvoiceStatus } from "../../../supabase/functions/_shared/payout-rules";

/** The creator's finalised payout as their own card sees it: no ids, numbers or PINs. */
export interface PayoutCardPayout {
  status: "pending" | "processing" | "paid" | "failed";
  gross_kes: number;
  net_kes: number;
  invoice_route: InvoiceRoute | null;
  invoice_status: InvoiceStatus;
  invoice_raised_at: string | null;
  invoice_decided_at: string | null;
  report_approved_at: string | null;
  payment_terms_days: number | null;
}

export interface PayoutCard {
  contract_signed: boolean;
  details: null | {
    mpesa_number_masked: string;
    mpesa_name: string;
    kra_pin_masked: string;
    legal_name: string;
    id_number_masked: string;
    vat_registered: boolean;
    bii_consent: boolean;
    confirmed_at: string;
  };
  payout: null | PayoutCardPayout;
}

type RpcError = { message?: string };
type RpcReply = { data: unknown; error: RpcError | null };
type Rpc = (name: string, args: Record<string, unknown>) => Promise<RpcReply>;

// A dropped connection rejects instead of returning an error, so both end up as `error`.
const publicRpc = (name: string, args: Record<string, unknown>): Promise<RpcReply> =>
  (publicSupabase as unknown as { rpc: Rpc }).rpc(name, args).catch((e: unknown) => ({
    data: null,
    error: e instanceof TypeError ? { message: "Couldn't reach the server. Check your connection and try again." } : (e as RpcError),
  }));

const fail = (error: RpcError) => new Error(error.message || "Something went wrong. Please try again.");

export async function getPayoutCard(token: string): Promise<PayoutCard | null> {
  const { data, error } = await publicRpc("get_payout_card_by_token", { _token: token });
  if (error) throw fail(error);
  return (data as PayoutCard | null) ?? null;
}

export async function savePayoutDetails(token: string, v: NormalisedDetails): Promise<PayoutCard> {
  const { data, error } = await publicRpc("save_payout_details_by_token", {
    _token: token,
    _details: {
      mpesa_number: v.mpesaNumber,
      mpesa_name: v.mpesaName,
      kra_pin: v.kraPin,
      legal_name: v.legalName,
      id_number: v.idNumber,
      vat_registered: v.vatRegistered,
      bii_consent: v.biiConsent,
    },
  });
  if (error) throw fail(error);
  return data as PayoutCard;
}
