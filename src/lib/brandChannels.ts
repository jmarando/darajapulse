import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dayKey, type Period } from "@/lib/listening";
import type { ChannelPlatform } from "../../supabase/functions/_shared/brand-sources";
import type { ReportDoc } from "../../supabase/functions/_shared/organic-report";

// The brand channel tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export type BrandChannel = {
  id: string;
  client_id: string;
  platform: ChannelPlatform;
  handle: string;
  external_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  source: "public" | "connected";
  status: "ok" | "needs_reconnect" | "paused" | "error";
  status_note: string | null;
  connected_at: string | null;
  connected_by_name: string | null;
  last_pull_at: string | null;
  last_good_pull_at: string | null;
  created_at: string;
};

/** The days a period covers, as the dates on screen. The report reads them as whole days in Nairobi. */
export const periodToRange = (p: Period) => ({ from: dayKey(new Date(p.start)), to: dayKey(new Date(p.end)) });

export async function loadChannels(clientId: string): Promise<BrandChannel[]> {
  const { data, error } = await db.from("brand_channels").select("*").eq("client_id", clientId).order("created_at");
  if (error) throw error;
  return (data ?? []) as BrandChannel[];
}

export async function loadReportDoc(clientId: string, from: string, to: string): Promise<ReportDoc> {
  const { data, error } = await db.rpc("get_brand_report_rows", { _client_id: clientId, _from: from, _to: to });
  if (error) throw error;
  return data as ReportDoc;
}

export async function addChannel(clientId: string, platform: ChannelPlatform, handle: string): Promise<BrandChannel> {
  const { data, error } = await db.from("brand_channels").insert({ client_id: clientId, platform, handle }).select().single();
  if (error) throw error;
  return data as BrandChannel;
}

export async function removeChannel(id: string): Promise<void> {
  const { error } = await db.from("brand_channels").delete().eq("id", id);
  if (error) throw error;
}

/** One read of one account. It can take up to a minute on a first read, and the card carries on meanwhile. */
export async function pullChannel(id: string): Promise<{ status?: string; note?: string | null; display_name?: string | null }> {
  const { data, error } = await supabase.functions.invoke("brand-channels-sync", { body: { channel_ids: [id] } });
  if (error) throw error;
  return data ?? {};
}

export function updatedLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "Not read yet";
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} ${days === 1 ? "day" : "days"} ago`;
}
