import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.24.2";

const LinkSchema = z.object({
  platform: z.enum(["tiktok", "instagram", "facebook", "youtube", "twitter"]),
  post_url: z.string().url().max(2000),
});
const BodySchema = z.object({
  token: z.string().min(16).max(128),
  brief_token: z.string().min(16).max(128).nullable().optional(),
  handle: z.string().max(120).optional().default(""),
  submitter_name: z.string().max(160).optional().default(""),
  submitter_email: z.string().email().max(320).or(z.literal("")).optional().default(""),
  links: z.array(LinkSchema).min(1).max(5),
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const body = parsed.data;
  const platforms = body.links.map((link) => link.platform);
  const urls = body.links.map((link) => link.post_url.toLowerCase());
  if (new Set(platforms).size !== platforms.length) return json({ error: "Add only one link per platform for the same video." }, 400);
  if (new Set(urls).size !== urls.length) return json({ error: "The same link cannot be submitted twice." }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: contestByToken } = await admin.from("contests").select("id").eq("submission_token", body.token).eq("is_active", true).maybeSingle();
  if (!contestByToken) return json({ error: "This submission link is no longer active." }, 404);
  const { data: existingLinks } = await admin.from("contest_entries").select("post_url").eq("contest_id", contestByToken.id).in("post_url", body.links.map((link) => link.post_url));
  if ((existingLinks ?? []).length) return json({ error: "One or more of these links were already submitted." }, 409);

  const first = body.links[0];
  const { data: firstResult, error: firstError } = await admin.rpc("submit_contest_entry", {
    _token: body.token,
    _platform: first.platform,
    _post_url: first.post_url,
    _handle: body.handle,
    _submitter_name: body.submitter_name,
    _submitter_email: body.submitter_email,
    _brief_token: body.brief_token ?? null,
  });
  if (firstError) return json({ error: firstError.message }, 400);

  const firstEntryId = String(firstResult?.entry_id || "");
  const { data: firstEntry } = await admin
    .from("contest_entries")
    .select("id, contest_id, influencer_id, handle, submitter_name, submitter_email, source, status, full_name")
    .eq("id", firstEntryId)
    .maybeSingle();
  if (!firstEntry) return json({ error: "Submission could not be verified." }, 400);

  const { data: contest } = await admin.from("contests").select("campaign_id").eq("id", firstEntry.contest_id).maybeSingle();
  const groupId = crypto.randomUUID();
  await admin.from("contest_entries").update({ creative_group_id: groupId }).eq("id", firstEntry.id);
  if (firstResult?.post_id) await admin.from("posts").update({ creative_group_id: groupId }).eq("id", firstResult.post_id);

  const results = [{ ...firstResult, ...first }];
  for (const link of body.links.slice(1)) {
    const { data: duplicate } = await admin
      .from("contest_entries")
      .select("id")
      .eq("contest_id", firstEntry.contest_id)
      .eq("post_url", link.post_url)
      .maybeSingle();
    if (duplicate) return json({ error: `That ${link.platform} link was already submitted.` }, 409);

    const { data: entry, error: entryError } = await admin.from("contest_entries").insert({
      contest_id: firstEntry.contest_id,
      influencer_id: firstEntry.influencer_id,
      platform: link.platform,
      post_url: link.post_url,
      handle: firstEntry.handle,
      submitter_name: firstEntry.submitter_name,
      submitter_email: firstEntry.submitter_email,
      source: firstEntry.source,
      status: firstEntry.status,
      full_name: firstEntry.full_name,
      creative_group_id: groupId,
    }).select("id").single();
    if (entryError) return json({ error: entryError.message }, 400);

    let postId: string | null = null;
    if (firstEntry.status === "approved" && contest?.campaign_id && firstEntry.influencer_id) {
      const { data: post, error: postError } = await admin.from("posts").insert({
        campaign_id: contest.campaign_id,
        influencer_id: firstEntry.influencer_id,
        platform: link.platform,
        post_url: link.post_url,
        status: "live",
        creative_group_id: groupId,
      }).select("id").single();
      if (postError) return json({ error: postError.message }, 400);
      postId = post?.id ?? null;
    }
    results.push({ entry_id: entry.id, post_id: postId, pending_review: firstEntry.status === "pending", ...link });
  }

  return json({ creative_group_id: groupId, results, post_ids: results.map((result) => result.post_id).filter(Boolean) });
});