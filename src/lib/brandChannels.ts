import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { publicOrigin } from "@/lib/appUrl";
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

export type ConnectLink = { id: string; token: string; expires_at: string; created_at: string };

/** Links still working. Staff only: the table's rules keep them from anyone else. */
export async function loadOpenLinks(clientId: string): Promise<ConnectLink[]> {
  const { data, error } = await db
    .from("brand_connect_links")
    .select("id, token, expires_at, created_at")
    .eq("client_id", clientId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConnectLink[];
}

export async function createConnectLink(clientId: string): Promise<ConnectLink> {
  const { data, error } = await db.from("brand_connect_links").insert({ client_id: clientId }).select("id, token, expires_at, created_at").single();
  if (error) throw error;
  return data as ConnectLink;
}

export async function cancelConnectLink(id: string): Promise<void> {
  const { error } = await db.from("brand_connect_links").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export const connectUrl = (token: string) => `${publicOrigin()}/connect/brand/${token}`;

export const whatsappUrl = (brandName: string, token: string) =>
  `https://wa.me/?text=${encodeURIComponent(`Please connect ${brandName}'s Facebook and Instagram to Daraja Pulse so we can report on them. It's read-only: we can't post or see messages. The link works for 7 days: ${connectUrl(token)}`)}`;

/** The address to send a signed-in person to for the Facebook login. */
export async function startConnect(clientId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("brand-connect-start", { body: { client_id: clientId } });
  if (error || !data?.url) throw new Error(error?.message ?? "No address came back.");
  return data.url as string;
}

export async function disconnectChannel(id: string): Promise<void> {
  const { error } = await db.rpc("disconnect_brand_channel", { _channel_id: id });
  if (error) throw error;
}

export type ShareLink = { id: string; token: string };

/** The brand's one live share link, made if there is none. Two people pressing Share together end up with the same one. */
export async function shareLink(clientId: string): Promise<ShareLink> {
  const live = () => db.from("brand_report_links").select("id, token").eq("client_id", clientId).eq("is_active", true).maybeSingle();
  const found = await live();
  if (found.error) throw found.error;
  if (found.data) return found.data as ShareLink;
  const { data, error } = await db.from("brand_report_links").insert({ client_id: clientId }).select("id, token").single();
  if (!error) return data as ShareLink;
  if (error.code !== "23505") throw error;
  const again = await live();
  if (again.error || !again.data) throw again.error ?? error;
  return again.data as ShareLink;
}

export async function turnOffShareLink(id: string): Promise<void> {
  const { error } = await db.from("brand_report_links").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

export const reportShareUrl = (token: string) => `${publicOrigin()}/o/${token}`;

export const reportWhatsappUrl = (brandName: string, token: string) =>
  `https://wa.me/?text=${encodeURIComponent(`Here is ${brandName}'s organic report: ${reportShareUrl(token)}`)}`;

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
