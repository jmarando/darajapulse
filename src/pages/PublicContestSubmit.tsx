import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, CheckCircle2, BadgeCheck, FileSignature } from "lucide-react";
import { toast } from "sonner";

/** Work out the platform straight from the pasted link so creators don't have to pick. */
const detectPlatform = (url: string): string => {
  const u = url.toLowerCase();
  if (u.includes("tiktok")) return "tiktok";
  if (u.includes("instagram")) return "instagram";
  if (u.includes("facebook") || u.includes("fb.watch")) return "facebook";
  if (u.includes("youtu")) return "youtube";
  if (u.includes("twitter") || u.includes("x.com")) return "twitter";
  return "";
};

const clean = (s?: string | null) => (s || "").trim().replace(/^@+/, "");

const PublicContestSubmit = () => {
  const { token } = useParams();
  const [params] = useSearchParams();
  // `k` is the creator's personal brief token — when present the form knows who is posting.
  const creatorToken = params.get("k");
  const [contest, setContest] = useState<any>(null);
  const [brief, setBrief] = useState<any>(null);
  const [draftState, setDraftState] = useState<any>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [again, setAgain] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState({ post_url: "", submitter_email: params.get("e") ?? "", handle: params.get("h") ?? "" });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_contest_by_token", { _token: token! });
      setContest(data);
    })();
  }, [token]);

  useEffect(() => {
    if (!creatorToken) return;
    (async () => {
      const { data } = await supabase.rpc("get_brief_by_token", { _token: creatorToken });
      if (data) setBrief(data);
    })();
  }, [creatorToken]);

  // Draft-approval gate — creators must get an MP4 signed off before posting.
  const loadDrafts = async () => {
    if (!creatorToken) return;
    const { data } = await supabase.rpc("get_creator_draft_state" as any, { _brief_token: creatorToken });
    setDraftState(data ?? null);
  };
  useEffect(() => { loadDrafts(); /* eslint-disable-next-line */ }, [creatorToken]);

  const draftsRequired = !!draftState?.required;
  const draftApproved = !!draftState?.approved_available;
  const drafts = (draftState?.drafts ?? []) as any[];

  // Contract gate — a campaign with an agreement can't accept posts until it's signed.
  const contractBlocked = !!(brief as any)?.contract_required && !(brief as any)?.contract_signed;


  // Campaigns without a prize are collaborations, not contests — copy adapts.
  const isCollab = useMemo(() => !contest?.prize, [contest]);
  const platform = detectPlatform(form.post_url);

  const creator = brief?.influencer ?? null;
  const creatorHandles: Array<{ platform: string; handle: string }> = useMemo(() => {
    if (!creator) return [];
    const out: Array<{ platform: string; handle: string }> = [];
    if (clean(creator.handle)) out.push({ platform: String(creator.primary_platform || "").toLowerCase(), handle: clean(creator.handle) });
    return out;
  }, [creator]);
  const target = Number(brief?.deliverables_count || 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.post_url) return toast.error("Paste your post link");
    if (!platform) return toast.error("That doesn't look like a TikTok, Instagram, Facebook, YouTube or X link");
    if (creator && !confirmed) return toast.error("Please confirm the post meets the brief");
    setLoading(true);
    const { data, error } = await supabase.rpc("submit_contest_entry", {
      _token: token!,
      _platform: platform,
      _post_url: form.post_url,
      _handle: creator ? clean(creator.handle) : form.handle,
      _submitter_name: creator ? creator.full_name ?? "" : "",
      _submitter_email: form.submitter_email,
      _brief_token: creatorToken,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    // Identified creators get their post registered on the campaign — kick off
    // the metrics pull immediately so the roster updates without waiting for cron.
    const postId = (data as any)?.post_id;
    if (postId) {
      supabase.functions.invoke("fetch-public-metrics", { body: { post_id: postId } }).catch(() => {});
    }
    setSubmitted(true);
  };

  if (!contest) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-secondary">
        <Card className="p-10 max-w-md text-center">
          <CheckCircle2 className="w-14 h-14 text-success mx-auto mb-4" />
          <h1 className="font-display text-3xl mb-2">
            {creator ? `Thanks, ${String(creator.full_name || "").split(" ")[0]}` : "Post received"}
          </h1>
          <p className="text-muted-foreground">
            {isCollab
              ? "It's now tracked against your deliverables. Come back and submit each new post as it goes live."
              : `We're reviewing your post. Winners are announced every ${contest.round_days || 14} days.`}
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => {
              setForm({ ...form, post_url: "" });
              setConfirmed(false);
              setSubmitted(false);
              setAgain(again + 1);
            }}
          >
            Submit another post
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-background to-secondary">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8 pt-8">
          {contest.client?.logo_url && <img src={contest.client.logo_url} alt={contest.client.name} className="h-12 mx-auto mb-4" />}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs uppercase tracking-widest mb-3">
            <Sparkles className="w-3.5 h-3.5" /> {contest.client?.name} {isCollab ? "collaboration" : "contest"}
          </div>
          <h1 className="font-display text-4xl">{contest.name}</h1>
          <p className="text-muted-foreground mt-2">
            {isCollab ? (
              <>
                Post with <span className="font-mono font-semibold text-foreground">{contest.hashtag}</span>, then drop the link here so
                it's tracked against your deliverables.
              </>
            ) : (
              <>
                Post with <span className="font-mono font-semibold text-foreground">{contest.hashtag}</span> and submit below.
              </>
            )}
          </p>
          {contest.prize && (
            <p className="text-sm mt-3">
              <strong>Prize:</strong> {contest.prize}
            </p>
          )}
        </div>

        {/* Personalised header — the creator is already identified by their link. */}
        {creator && (
          <Card className="p-4 mb-4 flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-full bg-secondary flex items-center justify-center font-display text-lg uppercase">
              {String(creator.full_name || "?")[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium truncate">{creator.full_name}</span>
                <BadgeCheck className="w-3.5 h-3.5 text-success shrink-0" />
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {creatorHandles.map((h) => (
                  <span key={h.platform + h.handle} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] leading-none">
                    <span className="capitalize text-muted-foreground">{h.platform || "handle"}</span>
                    <span className="font-mono">@{h.handle}</span>
                  </span>
                ))}
                {creatorHandles.length === 0 && <span className="text-xs text-muted-foreground">Handle on file</span>}
              </div>
            </div>
            {target > 0 && (
              <div className="text-right shrink-0">
                <div className="font-display text-xl leading-none">{target}</div>
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">Posts due</div>
              </div>
            )}
          </Card>
        )}

        {contractBlocked ? (
          <Card className="p-6 text-center border-accent/40 bg-accent/5">
            <FileSignature className="w-10 h-10 text-accent mx-auto mb-3" />
            <h2 className="font-display text-2xl">Sign your agreement first</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Before we can accept post links for this campaign, please read and sign the creator agreement on your
              brief page. It takes under a minute — then come straight back here.
            </p>
            <a href={`/b/${creatorToken}`}>
              <Button size="lg" className="mt-5 h-12 bg-accent text-accent-foreground hover:bg-accent/90">
                Open my brief & sign
              </Button>
            </a>
          </Card>
        ) : (
        <Card className="p-5 sm:p-6">

          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label className="text-sm">Post link *</Label>
              <Input
                required
                inputMode="url"
                autoComplete="url"
                value={form.post_url}
                onChange={(e) => setForm({ ...form, post_url: e.target.value })}
                placeholder="Paste your post link…"
                className="h-12 text-base mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                {platform ? (
                  <span className="text-success">Detected: {platform}</span>
                ) : (
                  "Open your post, tap Share → Copy link, then paste here. We pick up the platform automatically."
                )}
              </p>
            </div>

            {creator ? (
              <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                <span className="text-sm leading-snug">
                  This post is live and follows the brief — includes{" "}
                  <span className="font-mono font-medium">{contest.hashtag}</span> and the required brand mentions.
                </span>
              </label>
            ) : (
              <>
                <div>
                  <Label className="text-sm">Email you registered with *</Label>
                  <Input
                    required
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.submitter_email}
                    onChange={(e) => setForm({ ...form, submitter_email: e.target.value })}
                    placeholder="you@email.com"
                    className="h-12 text-base mt-1.5"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">We use this to match the post to your profile — nothing else needed.</p>
                </div>
                <div>
                  <Label className="text-sm">Handle used <span className="text-muted-foreground font-normal">(only if it's new to us)</span></Label>
                  <Input
                    value={form.handle}
                    onChange={(e) => setForm({ ...form, handle: e.target.value })}
                    placeholder="@yourhandle"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="h-12 text-base mt-1.5"
                  />
                </div>
              </>
            )}

            <Button type="submit" disabled={loading} size="lg" className="w-full h-12 text-base bg-primary">
              {loading ? "Submitting…" : "Submit post"}
            </Button>
          </form>
        </Card>
        )}

      </div>
    </div>
  );
};

export default PublicContestSubmit;
