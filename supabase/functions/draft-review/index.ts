import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const action = String(body?.action || "list");
    if (!token || token.length < 16) return json({ error: "invalid link" }, 400);

    const { data: link } = await admin
      .from("draft_links")
      .select("id, campaign_id, label, can_decide, is_active")
      .eq("token", token)
      .maybeSingle();
    if (!link || !link.is_active) return json({ error: "This review link is no longer active." }, 404);

    if (action === "decide") {
      if (!link.can_decide) return json({ error: "This link is view-only." }, 403);
      const draftId = String(body?.draft_id || "");
      const decision = String(body?.decision || "");
      const note = String(body?.note || "").slice(0, 2000);
      const reviewer = String(body?.reviewer || "").slice(0, 120);
      if (!draftId) return json({ error: "draft_id required" }, 400);
      if (!["approved", "changes_requested"].includes(decision)) return json({ error: "invalid decision" }, 400);
      if (decision === "changes_requested" && note.trim().length < 3) {
        return json({ error: "Please tell the creator what to change." }, 400);
      }

      const { error } = await admin
        .from("creator_drafts")
        .update({
          status: decision,
          review_note: note || null,
          reviewer_label: reviewer || link.label || "Client",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", draftId)
        .eq("campaign_id", link.campaign_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // list
    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, name, hashtag, clients(name, logo_url)")
      .eq("id", link.campaign_id)
      .maybeSingle();

    const { data: drafts } = await admin
      .from("creator_drafts")
      .select("id, file_path, file_name, mime_type, file_size, platform, caption, creator_note, status, review_note, reviewer_label, reviewed_at, created_at, post_url, influencers(full_name, handle, avatar_url)")
      .eq("campaign_id", link.campaign_id)
      .order("created_at", { ascending: false });

    const items = await Promise.all(
      (drafts ?? []).map(async (d: any) => {
        const { data: signed } = await admin.storage
          .from("creator-drafts")
          .createSignedUrl(d.file_path, 60 * 60 * 6);
        return {
          ...d,
          file_path: undefined,
          creator_name: d.influencers?.full_name ?? null,
          creator_handle: d.influencers?.handle ?? null,
          video_url: signed?.signedUrl ?? null,
        };
      }),
    );

    return json({
      campaign: {
        id: campaign?.id,
        name: campaign?.name,
        hashtag: campaign?.hashtag,
        client: (campaign as any)?.clients ?? null,
      },
      can_decide: link.can_decide,
      label: link.label,
      drafts: items,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});
