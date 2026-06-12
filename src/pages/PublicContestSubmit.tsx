import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const PublicContestSubmit = () => {
  const { token } = useParams();
  const [contest, setContest] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ platform: "tiktok", post_url: "", handle: "", submitter_name: "", submitter_email: "" });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_contest_by_token", { _token: token! });
      setContest(data);
    })();
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.post_url) return toast.error("Paste your post URL");
    setLoading(true);
    const { error } = await supabase.rpc("submit_contest_entry", {
      _token: token!, _platform: form.platform, _post_url: form.post_url,
      _handle: form.handle, _submitter_name: form.submitter_name, _submitter_email: form.submitter_email,
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
          <h1 className="font-display text-3xl mb-2">Entry received</h1>
          <p className="text-muted-foreground">We're reviewing your post. Winners are announced every {contest.round_days || 14} days.</p>
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
            <Trophy className="w-3.5 h-3.5" /> {contest.client?.name} contest
          </div>
          <h1 className="font-display text-4xl">{contest.name}</h1>
          <p className="text-muted-foreground mt-2">Post with <span className="font-mono font-semibold text-foreground">{contest.hashtag}</span> and submit below.</p>
          {contest.prize && <p className="text-sm mt-3"><strong>Prize:</strong> {contest.prize}</p>}
        </div>
        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label className="text-sm">Platform</Label>
              <Select value={form.platform} onValueChange={v => setForm({ ...form, platform: v })}>
                <SelectTrigger className="h-12 text-base mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(contest.platforms ?? ["tiktok"]).map((p: string) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Post URL *</Label>
              <Input
                required
                inputMode="url"
                autoComplete="url"
                value={form.post_url}
                onChange={e => setForm({ ...form, post_url: e.target.value })}
                placeholder="Paste your post link…"
                className="h-12 text-base mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Tip: open your post, tap Share → Copy link, then paste here.</p>
            </div>
            <div>
              <Label className="text-sm">Your handle</Label>
              <Input
                value={form.handle}
                onChange={e => setForm({ ...form, handle: e.target.value })}
                placeholder="@yourhandle"
                autoCapitalize="none"
                autoCorrect="off"
                className="h-12 text-base mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm">Name</Label>
              <Input
                value={form.submitter_name}
                onChange={e => setForm({ ...form, submitter_name: e.target.value })}
                autoComplete="name"
                className="h-12 text-base mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm">Email</Label>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.submitter_email}
                onChange={e => setForm({ ...form, submitter_email: e.target.value })}
                className="h-12 text-base mt-1.5"
              />
            </div>
            <Button type="submit" disabled={loading} size="lg" className="w-full h-12 text-base bg-primary">
              {loading ? "Submitting…" : "Submit entry"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default PublicContestSubmit;
