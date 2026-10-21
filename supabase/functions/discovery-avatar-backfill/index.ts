// Moves Discovery profile photos that still point at expiring Instagram/Facebook/TikTok
// CDN links into our own storage. Links that have already expired are looked up again
// through ScrapeCreators (one credit each, capped per run) when refetch_expired is set.
// Runs daily from the scheduler; super admins can also run it by hand.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireCaller, SUPER_ADMIN } from "../_shared/auth.ts";
import { copyAvatar, profilePhotoFrom } from "../_shared/avatar-store.ts";
import { scrapeCreatorsProfile, SCRAPECREATORS_ENABLED } from "../_shared/scrapecreators.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-job-key",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, { job: "discovery-avatar-backfill", roles: SUPER_ADMIN });
  if (caller instanceof Response) return caller;

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 300, 1), 1000);
  const refetch = body.refetch_expired === true && SCRAPECREATORS_ENABLED;
  const maxCredits = Math.min(Math.max(Number(body.max_credits) || 0, 0), 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows, error } = await supabase
    .from("discovery_creators")
    .select("id, platform, handle, avatar_url")
    .or("avatar_url.ilike.%cdninstagram.com%,avatar_url.ilike.%fbcdn.net%,avatar_url.ilike.%tiktokcdn%,avatar_url.ilike.%ibyteimg.com%")
    .limit(limit);
  if (error) return json({ error: error.message }, 500);

  let copied = 0, refetched = 0, cleared = 0, left = 0, credits = 0;
  for (const row of rows ?? []) {
    const key = `${row.platform}/${row.handle}`;
    let stored = await copyAvatar(supabase, row.avatar_url, key);
    if (stored) copied++;

    if (!stored && refetch && credits < maxCredits && ["instagram", "tiktok"].includes(row.platform)) {
      const profile = await scrapeCreatorsProfile(row.platform, row.handle);
      if (profile) {
        credits += profile.creditsCharged || 1;
        const fresh = profilePhotoFrom(profile.raw);
        stored = fresh ? await copyAvatar(supabase, fresh, key) : null;
        if (stored) refetched++;
      }
      if (!stored) {
        // Dead link and no fresh photo: show the initials placeholder instead of a broken image.
        await supabase.from("discovery_creators").update({ avatar_url: null }).eq("id", row.id);
        cleared++;
        continue;
      }
    }

    if (stored) await supabase.from("discovery_creators").update({ avatar_url: stored }).eq("id", row.id);
    else left++;
  }

  return json({ scanned: rows?.length ?? 0, copied, refetched, cleared, left, credits_used: credits });
});
