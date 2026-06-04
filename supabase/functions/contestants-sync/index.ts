// Pulls contestant registrations from CONTESTANT_FEED_URL and upserts them
// into contest_entries for a given contest. Idempotent (keyed on
// external_registration_id when present, otherwise on the IG/TikTok handle).
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

type Reg = {
  external_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  lga?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  raw: any;
};

const cleanHandle = (s?: string) =>
  (s || "").trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook)\.com\//i, "").replace(/[/?#].*$/, "").toLowerCase() || null;

// Try to normalize a feed payload from a variety of shapes (Flutter/Firebase
// exports, generic REST, JSONForms, etc).
function normalize(payload: any): Reg[] {
  const rows: any[] =
    Array.isArray(payload) ? payload :
    Array.isArray(payload?.responses) ? payload.responses :
    Array.isArray(payload?.data) ? payload.data :
    Array.isArray(payload?.items) ? payload.items :
    Array.isArray(payload?.results) ? payload.results :
    typeof payload === "object" && payload !== null ? Object.entries(payload).map(([k, v]: any) => ({ id: k, ...v })) :
    [];

  return rows.map((r: any, i: number) => {
    const flat = { ...(r?.fields || {}), ...(r?.answers || {}), ...r };
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const direct = flat[k];
        if (direct != null && String(direct).trim() !== "") return String(direct).trim();
        // case-insensitive
        const ck = Object.keys(flat).find(x => x.toLowerCase().replace(/[\s_-]/g, "") === k.toLowerCase().replace(/[\s_-]/g, ""));
        if (ck && flat[ck] != null && String(flat[ck]).trim() !== "") return String(flat[ck]).trim();
      }
      return undefined;
    };
    return {
      external_id: String(r?.id ?? r?._id ?? r?.uid ?? r?.responseId ?? r?.submission_id ?? `${i}-${get("email", "Email") || get("phone", "Phone") || ""}`),
      full_name: get("name", "Name", "fullName", "full_name"),
      email: get("email", "Email"),
      phone: get("phone", "Phone", "phoneNumber"),
      address: get("address", "Address"),
      lga: get("lga", "LGA", "localGovernmentArea", "local_government_area", "Local Government Area"),
      instagram: cleanHandle(get("instagram", "Instagram", "ig", "igHandle", "instagram_handle")),
      tiktok: cleanHandle(get("tiktok", "TikTok", "tiktokHandle", "tiktok_handle")),
      facebook: cleanHandle(get("facebook", "Facebook", "facebookHandle")),
      raw: r,
    } as Reg;
  }).filter(r => r.email || r.instagram || r.tiktok || r.facebook || r.phone);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let runId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const contest_id: string | undefined = body.contest_id;
    const triggered_by = body.triggered_by ?? "manual";
    if (!contest_id) {
      return new Response(JSON.stringify({ error: "contest_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const feedUrl = Deno.env.get("CONTESTANT_FEED_URL");
    if (!feedUrl) {
      return new Response(JSON.stringify({ error: "CONTESTANT_FEED_URL not set" }), { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authHeader = Deno.env.get("CONTESTANT_FEED_AUTH_HEADER");

    const { data: run } = await sb.from("contestant_sync_runs").insert({
      contest_id, source: "feed", triggered_by, status: "running",
    }).select("id").single();
    runId = run?.id ?? null;

    const headers: Record<string, string> = { Accept: "application/json" };
    if (authHeader) {
      const idx = authHeader.indexOf(":");
      if (idx > -1) headers[authHeader.slice(0, idx).trim()] = authHeader.slice(idx + 1).trim();
      else headers["Authorization"] = authHeader;
    }

    const res = await fetch(feedUrl, { headers });
    if (!res.ok) throw new Error(`Feed responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const payload = await res.json();
    const regs = normalize(payload);

    let upserted = 0;
    let skipped_excluded = 0;
    const errors: any[] = [];
    const cleanH = (s?: string | null) => (s || "").trim().replace(/^@+/, "").toLowerCase();
    const { data: excluded } = await sb.from("contest_excluded_handles").select("handle").eq("contest_id", contest_id);
    const excludedSet = new Set<string>(((excluded ?? []) as any[]).map((r: any) => cleanH(r.handle)).filter(Boolean));
    for (const r of regs) {
      try {
        const handles = [r.instagram, r.tiktok, r.facebook].map(cleanH).filter(Boolean);
        if (handles.some((h) => excludedSet.has(h))) { skipped_excluded++; continue; }
        const row = {
          contest_id,
          external_registration_id: r.external_id,
          platform: (r.tiktok ? "tiktok" : r.instagram ? "instagram" : "facebook") as any,
          status: "registered",
          source: "registration",
          full_name: r.full_name ?? null,
          submitter_name: r.full_name ?? null,
          submitter_email: r.email ?? null,
          phone: r.phone ?? null,
          address: r.address ?? null,
          lga: r.lga ?? null,
          instagram_handle: r.instagram ?? null,
          tiktok_handle: r.tiktok ?? null,
          facebook_handle: r.facebook ?? null,
          handle: r.instagram || r.tiktok || r.facebook || null,
          metadata: { raw: r.raw },
        };
        const { error } = await sb.from("contest_entries")
          .upsert(row, { onConflict: "contest_id,external_registration_id", ignoreDuplicates: false });
        if (error) errors.push({ external_id: r.external_id, msg: error.message });
        else upserted++;
      } catch (e) {
        errors.push({ external_id: r.external_id, msg: e instanceof Error ? e.message : String(e) });
      }
    }

    if (runId) {
      await sb.from("contestant_sync_runs").update({
        finished_at: new Date().toISOString(), fetched: regs.length, upserted, errors, status: errors.length ? "partial" : "ok",
      }).eq("id", runId);
    }

    return new Response(JSON.stringify({ fetched: regs.length, upserted, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) await sb.from("contestant_sync_runs").update({ finished_at: new Date().toISOString(), status: "error", errors: [{ msg }] }).eq("id", runId);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
