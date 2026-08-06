import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, CheckCircle2 } from "lucide-react";
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

const PublicContestSubmit = () => {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [contest, setContest] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [again, setAgain] = useState(0);
  const [form, setForm] = useState({ post_url: "", submitter_email: params.get("e") ?? "", handle: params.get("h") ?? "" });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_contest_by_token", { _token: token! });
      setContest(data);
    })();
  }, [token]);

  // Campaigns without a prize are collaborations, not contests — copy adapts.
  const isCollab = useMemo(() => !contest?.prize, [contest]);
  const platform = detectPlatform(form.post_url);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.post_url) return toast.error("Paste your post link");
    if (!platform) return toast.error("That doesn't look like a TikTok, Instagram, Facebook, YouTube or X link");
    setLoading(true);
    const { error } = await supabase.rpc("submit_contest_entry", {
      _token: token!,
      _platform: platform,
      _post_url: form.post_url,
      _handle: form.handle,
      _submitter_name: "",
      _submitter_email: form.submitter_email,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSubmitted(true);
  };

  if (!contest) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-secondary">
        <Card className="p-10 max-w-md text-center">
          <CheckCircle2 className="w-14 h-14 text-success mx-auto mb-4" />
          <h1 className="font-display text-3xl mb-2">Post received</h1>
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
            <Button type="submit" disabled={loading} size="lg" className="w-full h-12 text-base bg-primary">
              {loading ? "Submitting…" : "Submit post"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default PublicContestSubmit;
