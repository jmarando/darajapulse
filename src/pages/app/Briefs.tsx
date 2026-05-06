import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X, FileText, Sparkles, ExternalLink, Save, Hash, Wallet, Calendar, AtSign, Check, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

type Campaign = any;

const TEMPLATES: Record<string, Partial<any>> = {
  "Product launch": {
    objective: "Generate buzz and consideration around the new product launch with authentic creator-led storytelling.",
    tone: "Energetic, aspirational, and on-brand",
    content_format: "1× TikTok video (30–60s) + 1× Instagram Reel (15–30s)",
    dos: [
      "Show the product in everyday context",
      "Use natural lighting and clean framing",
      "Mention the brand name in the first 5 seconds",
      "Add the campaign hashtag in caption AND on-screen",
    ],
    donts: [
      "No competitor mentions or visible logos",
      "No politically sensitive or polarising content",
      "No alcohol, tobacco, or gambling references",
      "Don't make medical or unverifiable claims",
    ],
  },
  "Always-on advocacy": {
    objective: "Drive sustained brand love and conversation through monthly creator drops.",
    tone: "Conversational, warm, community-first",
    content_format: "2× short-form videos per month",
    dos: ["Tell a personal story", "Reply to top 3 comments", "Tag the brand handle"],
    donts: ["Don't repurpose old content", "No paid-ad styling"],
  },
  "Awareness push": {
    objective: "Maximise reach and impressions in target market over a 2-week burst.",
    tone: "Bold, scroll-stopping, culturally relevant",
    content_format: "1× hook-led TikTok + 3× Instagram Stories",
    dos: ["Lead with a strong hook in 0–3s", "Use trending audio where on-brand"],
    donts: ["Don't bury the brand mention", "No misleading thumbnails"],
  },
};

const Briefs = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [c, setC] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await supabase.from("campaigns").select("*, clients(name, slug)").order("created_at", { ascending: false });
    setCampaigns(data ?? []);
    if (!selectedId && data && data.length) setSelectedId(data[0].id);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedId) { setC(null); return; }
    const found = campaigns.find(x => x.id === selectedId);
    if (found) setC({
      ...found,
      dos: found.dos ?? [],
      donts: found.donts ?? [],
      mandatory_mentions: found.mandatory_mentions ?? [],
      hashtags_extra: found.hashtags_extra ?? [],
      references_urls: found.references_urls ?? [],
      wht_percent: found.wht_percent ?? 5,
    });
  }, [selectedId, campaigns]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return campaigns.filter(x => !q || x.name?.toLowerCase().includes(q) || x.clients?.name?.toLowerCase().includes(q));
  }, [campaigns, search]);

  const save = async () => {
    if (!c) return;
    setSaving(true);
    const { error } = await supabase.from("campaigns").update({
      objective: c.objective,
      brief: c.brief,
      hashtag: c.hashtag,
      content_format: c.content_format,
      tone: c.tone,
      dos: c.dos,
      donts: c.donts,
      mandatory_mentions: c.mandatory_mentions,
      hashtags_extra: c.hashtags_extra,
      references_urls: c.references_urls,
      wht_percent: Number(c.wht_percent) || 0,
    }).eq("id", c.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Brief saved");
    load();
  };

  const applyTemplate = (key: string) => {
    if (!c) return;
    const t = TEMPLATES[key];
    setC({ ...c, ...t, dos: [...(t.dos ?? []), ...(c.dos ?? [])], donts: [...(t.donts ?? []), ...(c.donts ?? [])] });
    toast.success(`Applied "${key}" template`);
  };

  const ListEditor = ({ label, items, onChange, placeholder, icon: Icon }: any) => {
    const [v, setV] = useState("");
    const add = () => { if (!v.trim()) return; onChange([...(items ?? []), v.trim()]); setV(""); };
    return (
      <div>
        <Label className="flex items-center gap-1.5">{Icon && <Icon className="w-3.5 h-3.5" />}{label}</Label>
        <div className="flex gap-2 mt-1.5">
          <Input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder} />
          <Button type="button" variant="outline" size="icon" onClick={add}><Plus className="w-4 h-4" /></Button>
        </div>
        {items && items.length > 0 && (
          <ul className="mt-2 space-y-1">
            {items.map((it: string, i: number) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-md bg-secondary/50 group">
                <span className="min-w-0 truncate">{it}</span>
                <button onClick={() => onChange(items.filter((_: any, j: number) => j !== i))} className="opacity-50 group-hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Workspace</div>
        <h1 className="font-display text-4xl font-semibold mt-1">Brief builder</h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl">Templated objectives, do's & don'ts, deliverables, hashtags, mandatory @mentions, and shareable creator briefs with WHT awareness.</p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Campaign picker */}
        <Card className="p-4 lg:col-span-3 h-fit">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Campaigns</div>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="mb-3 h-9" />
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-5 h-5 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-2">No campaigns yet.</p>
              <Link to="/app/campaigns" className="text-xs text-accent">Create one →</Link>
            </div>
          ) : (
            <ul className="space-y-1 max-h-[60vh] overflow-auto -mx-1">
              {filtered.map(x => (
                <li key={x.id}>
                  <button
                    onClick={() => setSelectedId(x.id)}
                    className={`w-full text-left px-2 py-2 rounded-md transition-colors ${selectedId === x.id ? "bg-secondary" : "hover:bg-secondary/50"}`}
                  >
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{x.clients?.name}</div>
                    <div className="text-sm font-medium truncate">{x.name}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Editor */}
        {!c ? (
          <Card className="p-10 lg:col-span-9 text-center text-muted-foreground">Select a campaign to start editing its brief.</Card>
        ) : (
          <div className="lg:col-span-9 space-y-6">
            {/* Header */}
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.clients?.name}</div>
                  <div className="font-display text-2xl mt-0.5 truncate">{c.name}</div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                    {c.start_date && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{c.start_date} → {c.end_date || "—"}</span>}
                    {c.budget_kes > 0 && <span className="inline-flex items-center gap-1"><Wallet className="w-3 h-3" />KES {Number(c.budget_kes).toLocaleString()}</span>}
                    <Badge variant="outline" className="capitalize">{c.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger className="w-44"><div className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /><SelectValue placeholder="Apply template" /></div></SelectTrigger>
                    <SelectContent>{Object.keys(TEMPLATES).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                  </Select>
                  <Link to={`/app/campaigns/${c.id}`}><Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Campaign</Button></Link>
                  <Button onClick={save} disabled={saving} size="sm" className="bg-primary"><Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save brief"}</Button>
                </div>
              </div>
            </Card>

            {/* Big-picture */}
            <Card className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Big picture</div>
              <div className="space-y-4">
                <div>
                  <Label>Objective</Label>
                  <Textarea rows={2} value={c.objective ?? ""} onChange={e => setC({ ...c, objective: e.target.value })} placeholder="What does success look like for the brand?" className="mt-1.5" />
                </div>
                <div>
                  <Label>Brief / story</Label>
                  <Textarea rows={5} value={c.brief ?? ""} onChange={e => setC({ ...c, brief: e.target.value })} placeholder="Background, audience, why now, key message." className="mt-1.5" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Content format</Label>
                    <Input value={c.content_format ?? ""} onChange={e => setC({ ...c, content_format: e.target.value })} placeholder="e.g. 1× TikTok 30–60s + 1× IG Reel" className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Tone</Label>
                    <Input value={c.tone ?? ""} onChange={e => setC({ ...c, tone: e.target.value })} placeholder="e.g. Warm, witty, Gen-Z" className="mt-1.5" />
                  </div>
                </div>
              </div>
            </Card>

            {/* Do's & Don'ts */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md bg-success/15 text-success flex items-center justify-center"><Check className="w-4 h-4" /></div>
                  <h3 className="font-display text-lg">Do's</h3>
                </div>
                <ListEditor label="Add a do" items={c.dos} onChange={(v: any) => setC({ ...c, dos: v })} placeholder="e.g. Mention the brand in first 5s" />
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md bg-destructive/15 text-destructive flex items-center justify-center"><X className="w-4 h-4" /></div>
                  <h3 className="font-display text-lg">Don'ts</h3>
                </div>
                <ListEditor label="Add a don't" items={c.donts} onChange={(v: any) => setC({ ...c, donts: v })} placeholder="e.g. No competitor mentions" />
              </Card>
            </div>

            {/* Tags & mentions */}
            <Card className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Tags & mentions</div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />Primary hashtag</Label>
                  <Input value={c.hashtag ?? ""} onChange={e => setC({ ...c, hashtag: e.target.value })} placeholder="#YourCampaign" className="mt-1.5" />
                </div>
                <ListEditor label="Additional hashtags" items={c.hashtags_extra} onChange={(v: any) => setC({ ...c, hashtags_extra: v })} placeholder="#extraTag" icon={Hash} />
              </div>
              <div className="mt-4">
                <ListEditor label="Mandatory @mentions" items={c.mandatory_mentions} onChange={(v: any) => setC({ ...c, mandatory_mentions: v })} placeholder="@brandhandle" icon={AtSign} />
              </div>
              <div className="mt-4">
                <ListEditor label="Reference links" items={c.references_urls} onChange={(v: any) => setC({ ...c, references_urls: v })} placeholder="https://..." icon={LinkIcon} />
              </div>
            </Card>

            {/* Compliance */}
            <Card className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Compliance & payout</div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label>Withholding tax %</Label>
                  <Input type="number" step="0.5" value={c.wht_percent ?? 5} onChange={e => setC({ ...c, wht_percent: e.target.value })} className="mt-1.5" />
                  <p className="text-[10px] text-muted-foreground mt-1">KE residents: 5% standard. Non-residents: 20%.</p>
                </div>
                <div className="sm:col-span-2 bg-secondary/40 rounded-md p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">e-Sign & WHT awareness</p>
                  <p>Each creator's brief link doubles as their agreement. Once they Accept, the timestamp is recorded as e-signature. Payouts apply WHT at the rate above and produce e-TIMS-ready records (in the Payouts module).</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
export default Briefs;
