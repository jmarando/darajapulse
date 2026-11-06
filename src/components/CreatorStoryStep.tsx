import { useState } from "react";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ImageIcon } from "lucide-react";
import { toast } from "sonner";

const MAX_BYTES = 5 * 1024 * 1024;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });

/** Creators send their story insights screenshot from the brief page. We read the numbers; the team confirms them. */
const CreatorStoryStep = ({ briefToken, locked }: { briefToken: string; locked: boolean }) => {
  const [platform, setPlatform] = useState("instagram");
  const [postedAt, setPostedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [file, setFile] = useState<File | null>(null);
  const [reach, setReach] = useState("");
  const [impressions, setImpressions] = useState("");
  const [replies, setReplies] = useState("");
  const [linkClicks, setLinkClicks] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Choose your insights screenshot first");
    if (file.size > MAX_BYTES) return toast.error("That screenshot is too big (max 5MB)");
    if (!file.type.startsWith("image/")) return toast.error("Use an image screenshot");
    setBusy(true);
    try {
      const image = await readAsDataUrl(file);
      const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Math.round(Number(v) || 0)));
      const { data, error } = await supabase.functions.invoke("submit-creator-story", {
        body: {
          brief_token: briefToken,
          platform,
          posted_at: new Date(postedAt).toISOString(),
          image,
          reach: num(reach),
          impressions: num(impressions),
          replies: num(replies),
          link_clicks: num(linkClicks),
        },
      });
      const payload = data as { error?: unknown; ai_reading?: { reach?: unknown; views?: unknown; replies?: unknown } } | null;
      if (error || payload?.error) {
        const msg = payload?.error ?? "Could not save your story";
        return toast.error(typeof msg === "string" ? msg : "Could not save your story");
      }
      const ai = payload?.ai_reading ?? {};
      const summary = [
        typeof ai.reach === "number" ? `reach ${ai.reach.toLocaleString()}` : null,
        typeof ai.views === "number" ? `${ai.views.toLocaleString()} views` : null,
        typeof ai.replies === "number" ? `${ai.replies.toLocaleString()} replies` : null,
      ].filter(Boolean).join(" · ");
      setSent(summary || "Your screenshot is with the team.");
      setFile(null);
      setReach("");
      setImpressions("");
      setReplies("");
      setLinkClicks("");
    } catch {
      toast.error("Could not save your story");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={`p-6 mt-6 border-border ${locked ? "opacity-60" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Stories</div>
      <h3 className="font-display text-xl mt-1">Send your story screenshot</h3>
      <p className="text-sm text-muted-foreground mt-2">
        Stories vanish after 24 hours, so send us your insights screenshot straight after posting.
        We read the numbers for you — you can type them too if you&apos;d like. The team checks each one.
      </p>
      {locked ? (
        <p className="text-sm text-accent mt-4 font-medium">Unlocks after you sign your agreement.</p>
      ) : sent ? (
        <div className="mt-4 rounded-md border border-border bg-card p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium">Got it — thank you.</div>
            <p className="text-sm text-muted-foreground mt-0.5">We read {sent} The team will confirm it.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setSent(null)}>Send another</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Story date</Label>
              <Input type="datetime-local" value={postedAt} onChange={(e) => setPostedAt(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Screenshot *</Label>
            <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5"><ImageIcon className="w-3 h-3" /> Your story insights — reach, views, replies.</p>
          </div>
          <details className="rounded-md border border-border p-3">
            <summary className="text-sm font-medium cursor-pointer">Type the numbers too (optional)</summary>
            <p className="text-xs text-muted-foreground mt-1">We already read the screenshot. Type over them only if you want different numbers.</p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><Label>Reach</Label><Input inputMode="numeric" value={reach} onChange={(e) => setReach(e.target.value)} placeholder="e.g. 4200" /></div>
              <div><Label>Views</Label><Input inputMode="numeric" value={impressions} onChange={(e) => setImpressions(e.target.value)} /></div>
              <div><Label>Replies</Label><Input inputMode="numeric" value={replies} onChange={(e) => setReplies(e.target.value)} /></div>
              <div><Label>Link taps</Label><Input inputMode="numeric" value={linkClicks} onChange={(e) => setLinkClicks(e.target.value)} /></div>
            </div>
          </details>
          <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={busy}>{busy ? "Sending…" : "Send story screenshot"}</Button>
        </form>
      )}
    </Card>
  );
};

export default CreatorStoryStep;
