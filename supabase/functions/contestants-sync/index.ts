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
  platform?: string;
  post_url?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  raw: any;
};

const cleanValue = (s?: any) => {
  const value = String(s ?? "").trim();
  if (!value || /^(-|none|null|n\/a|na)$/i.test(value)) return null;
  return value;
};

const cleanHandle = (s?: string) => {
  const value = cleanValue(s);
  if (!value) return null;
  return value.replace(/^@+/, "").replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook)\.com\//i, "").replace(/[/?#].*$/, "").toLowerCase() || null;
};

async function resolveTikTokShort(url: string): Promise<string> {
  if (!/(?:vt|vm)\.tiktok\.com\//i.test(url)) return url;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function canonicalPostUrlSync(raw?: string | null): string | null {
  const url = cleanValue(raw);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const tt = url.match(/tiktok\.com\/.*?(?:\/video\/|\/v\/|share_item_id=)(\d{6,})/i);
  if (tt) return `https://www.tiktok.com/video/${tt[1]}`;
  const ig = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return `https://www.instagram.com/p/${ig[1]}/`;
  try { const u = new URL(url); return `${u.origin}${u.pathname}`.replace(/\/+$/, ""); } catch { return url; }
}

async function canonicalPostUrl(raw?: string | null): Promise<string | null> {
  const value = cleanValue(raw);
  if (!value) return null;
  return canonicalPostUrlSync(await resolveTikTokShort(value));
}

const platformFromPostUrl = (url?: string | null) => {
  const u = (url || "").toLowerCase();
  if (/instagram\.com/.test(u)) return "instagram";
  if (/tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com/.test(u)) return "tiktok";
  if (/facebook\.com|fb\.watch/.test(u)) return "facebook";
  return null;
};

const stableRegistrationId = (r: any, i: number, get: (...keys: string[]) => string | undefined) => {
  const response = String(r?.id ?? r?._id ?? r?.uid ?? r?.responseId ?? r?.submission_id ?? get("response", "Response #") ?? `row-${i + 1}`).trim();
  const email = (get("email", "Email") || "").trim().toLowerCase();
  const phone = (get("phone", "Phone", "phoneNumber", "Phone Number") || "").replace(/\D/g, "");
  const stamp = (get("timestamp", "Timestamp", "created_at") || "").trim().toLowerCase();
  const name = (get("name", "Name", "fullName", "full_name", "Full Name") || "").trim().toLowerCase().replace(/\s+/g, " ");
  return `csv:${response}:${email || phone || `${name}:${stamp}` || `row-${i + 1}`}`.slice(0, 220);
};

async function fetchAllContestEntries(sb: any, contest_id: string, columns: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from("contest_entries")
      .select(columns)
      .eq("contest_id", contest_id)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

// Try to normalize a feed payload from a variety of shapes (Flutter/Firebase
// exports, generic REST, JSONForms, etc).
async function normalize(payload: any): Promise<Reg[]> {
  const rows: any[] =
    Array.isArray(payload) ? payload :
    Array.isArray(payload?.responses) ? payload.responses :
    Array.isArray(payload?.data) ? payload.data :
    Array.isArray(payload?.items) ? payload.items :
    Array.isArray(payload?.results) ? payload.results :
    typeof payload === "object" && payload !== null ? Object.entries(payload).map(([k, v]: any) => ({ id: k, ...v })) :
    [];

  const regs: Reg[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const flat = { ...(r?.fields || {}), ...(r?.answers || {}), ...r };
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const direct = flat[k];
        const directValue = cleanValue(direct);
        if (directValue) return directValue;
        // case-insensitive
        const ck = Object.keys(flat).find(x => x.toLowerCase().replace(/[\s_-]/g, "") === k.toLowerCase().replace(/[\s_-]/g, ""));
        const matchedValue = ck ? cleanValue(flat[ck]) : null;
        if (matchedValue) return matchedValue;
      }
      return undefined;
    };
    const postUrl = await canonicalPostUrl(get("postUrl", "post_url", "Post URL", "url", "video url"));
    const selectedPlatform = (get("selectedPlatform", "Selected Platform", "platform") || "").toLowerCase();
    const platform = ["tiktok", "instagram", "facebook", "youtube", "twitter"].includes(selectedPlatform)
      ? selectedPlatform
      : platformFromPostUrl(postUrl) ?? undefined;
    const reg = {
      external_id: stableRegistrationId(r, i, get),
      full_name: get("name", "Name", "fullName", "full_name"),
      email: get("email", "Email"),
      phone: get("phone", "Phone", "phoneNumber"),
      address: get("address", "Address"),
      lga: get("lga", "LGA", "localGovernmentArea", "local_government_area", "Local Government Area"),
      platform,
      post_url: postUrl ?? undefined,
      instagram: cleanHandle(get("instagram", "Instagram", "ig", "igHandle", "instagram_handle")),
      tiktok: cleanHandle(get("tiktok", "TikTok", "tiktokHandle", "tiktok_handle")),
      facebook: cleanHandle(get("facebook", "Facebook", "facebookHandle")),
      raw: r,
    } as Reg;
    if (reg.email || reg.instagram || reg.tiktok || reg.facebook || reg.phone || reg.post_url) regs.push(reg);
  }
  return regs;
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

    const { data: run } = await sb.from("contestant_sync_runs").insert({
      contest_id, source: "feed", triggered_by, status: "running",
    }).select("id").single();
    runId = run?.id ?? null;

    let payload: any = body.registrations ?? body.rows ?? null;
    if (!payload) {
      const feedUrl = Deno.env.get("CONTESTANT_FEED_URL");
      if (!feedUrl) {
        return new Response(JSON.stringify({ error: "CONTESTANT_FEED_URL not set" }), { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const authHeader = Deno.env.get("CONTESTANT_FEED_AUTH_HEADER");
      const headers: Record<string, string> = { Accept: "application/json" };
      if (authHeader) {
        const idx = authHeader.indexOf(":");
        if (idx > -1) headers[authHeader.slice(0, idx).trim()] = authHeader.slice(idx + 1).trim();
        else headers["Authorization"] = authHeader;
      }
      const res = await fetch(feedUrl, { headers });
      if (!res.ok) throw new Error(`Feed responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
      payload = await res.json();
    }
    const regs = await normalize(payload);

    let upserted = 0;
    let skipped_excluded = 0;
    const errors: any[] = [];
    const cleanH = (s?: string | null) => (s || "").trim().replace(/^@+/, "").toLowerCase();
    const { data: excluded } = await sb.from("contest_excluded_handles").select("handle").eq("contest_id", contest_id);
    const excludedSet = new Set<string>(((excluded ?? []) as any[]).map((r: any) => cleanH(r.handle)).filter(Boolean));
    const existingRows = await fetchAllContestEntries(
      sb,
      contest_id,
      "id, external_registration_id, post_url, full_name, submitter_name, submitter_email, phone",
    );
    const byExt = new Map(((existingRows ?? []) as any[]).filter(r => r.external_registration_id).map(r => [String(r.external_registration_id), r]));
    const byUrl = new Map(((existingRows ?? []) as any[]).filter(r => r.post_url).map(r => [canonicalPostUrlSync(r.post_url), r]));
    const norm = (v?: any) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const sameContestant = (a: any, b: any) => {
      const ae = norm(a.submitter_email); const be = norm(b.submitter_email);
      if (ae && be && ae === be) return true;
      const ap = String(a.phone || "").replace(/\D/g, ""); const bp = String(b.phone || "").replace(/\D/g, "");
      if (ap.length >= 7 && bp.length >= 7 && ap === bp) return true;
      const an = norm(a.full_name || a.submitter_name); const bn = norm(b.full_name || b.submitter_name);
      return !!an && !!bn && an === bn;
    };
    for (const r of regs) {
      try {
        const handles = [r.instagram, r.tiktok, r.facebook].map(cleanH).filter(Boolean);
        if (handles.some((h) => excludedSet.has(h))) { skipped_excluded++; continue; }
        const row = {
          contest_id,
          external_registration_id: r.external_id,
          platform: (r.platform || (r.tiktok ? "tiktok" : r.instagram ? "instagram" : "facebook")) as any,
          ...(r.post_url ? { post_url: r.post_url } : {}),
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
        const legacyId = String(r.raw?.id ?? r.raw?._id ?? r.raw?.uid ?? r.raw?.responseId ?? r.raw?.submission_id ?? r.raw?.["Response #"] ?? "");
        const legacy = legacyId ? byExt.get(legacyId) : null;
        const urlKey = canonicalPostUrlSync(r.post_url);
        const target = (urlKey ? byUrl.get(urlKey) : null) || byExt.get(r.external_id) || (legacy && sameContestant(legacy, row) ? legacy : null);
        const targetUrl = canonicalPostUrlSync(target?.post_url);
        const payload: any = { ...row };
        if (target) {
          for (const key of ["handle", "instagram_handle", "tiktok_handle", "facebook_handle"]) {
            if (payload[key] == null) delete payload[key];
          }
        }
        // Do NOT reset metrics when the URL changes — the previous peak is real
        // engagement earned on the earlier link and should be preserved. The
        // metrics-refresh job will merge with MAX() against the new URL's stats.
        if (target && r.post_url && targetUrl !== urlKey) {
          const prevUrls: string[] = Array.isArray(target.cross_posts) ? target.cross_posts : [];
          if (targetUrl && !prevUrls.includes(targetUrl)) payload.cross_posts = [...prevUrls, targetUrl];
        }
        const { error } = target
          ? await sb.from("contest_entries").update(payload).eq("id", target.id)
          : await sb.from("contest_entries").insert(payload);
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
