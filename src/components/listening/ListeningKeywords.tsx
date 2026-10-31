import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Panel } from "@/components/dash/Panel";
import { StatusChip } from "@/components/dash/chips";
import ListeningAlerts from "./ListeningAlerts";
import {
  CREDITS_PER_SEARCH, DAILY_CREDITS, KIND_LABEL, MAX_ACTIVE_TOPICS, parseTerms, type ListeningTopic, type TopicKind,
} from "@/lib/listening";

// The listening tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

const KIND_HINT: Record<TopicKind, string> = {
  brand: "Your brand name, products or campaign hashtag",
  competitor: "A rival brand, to compare share of voice and mood",
  category: "What you sell, e.g. “energy drink” or “mobile money”",
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not yet";

export default function ListeningKeywords({ clientId, brandName, topics, creditsToday, showCredits, canEditAlerts, onChanged }: {
  clientId: string;
  brandName: string;
  topics: ListeningTopic[];
  creditsToday: number | null;
  showCredits: boolean;
  canEditAlerts: boolean;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<TopicKind>(topics.some((t) => t.kind === "brand") ? "competitor" : "brand");
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [exclude, setExclude] = useState("");
  const [saving, setSaving] = useState(false);
  const active = topics.filter((t) => t.active).length;
  const full = active >= MAX_ACTIVE_TOPICS;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = label.trim() || query.trim();
    const phrase = query.trim() || label.trim();
    if (phrase.length < 2) return toast({ title: "Enter what to search for", variant: "destructive" });
    setSaving(true);
    const { error } = await db.from("listening_topics").insert({
      client_id: clientId, kind, label: name.slice(0, 60), query: phrase.slice(0, 80), exclude_terms: parseTerms(exclude),
    });
    setSaving(false);
    if (error) return toast({ title: "Couldn't add keyword", description: error.message, variant: "destructive" });
    toast({ title: `Listening for “${phrase}”`, description: "It's searched within the hour, then twice a day." });
    setLabel(""); setQuery(""); setExclude("");
    if (kind === "brand") setKind("competitor");
    onChanged();
  };

  const toggle = async (t: ListeningTopic, on: boolean) => {
    const { error } = await db.from("listening_topics").update({ active: on }).eq("id", t.id);
    if (error) return toast({ title: "Couldn't change keyword", description: error.message, variant: "destructive" });
    onChanged();
  };

  const remove = async (t: ListeningTopic) => {
    if (!window.confirm(`Stop listening for “${t.label}” and delete the posts it found?`)) return;
    const { error } = await db.from("listening_topics").delete().eq("id", t.id);
    if (error) return toast({ title: "Couldn't remove keyword", description: error.message, variant: "destructive" });
    onChanged();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Panel title="Keywords" subtitle={`${active} of ${MAX_ACTIVE_TOPICS} active for ${brandName}`} className="lg:col-span-3">
        {topics.length ? (
          <ul className="divide-y divide-border/70">
            {topics.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium">{t.label}</span>
                    <StatusChip tone={t.kind === "brand" ? "info" : "neutral"}>{KIND_LABEL[t.kind]}</StatusChip>
                    {!t.active && <span className="text-[12px] text-muted-foreground">Paused</span>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    Searches “{t.query}”{t.exclude_terms.length ? `, skipping posts with ${t.exclude_terms.join(", ")}` : ""} · Last searched {when(t.last_scanned_at)}
                  </p>
                  {t.last_note && <p className="mt-1 text-[12px] text-status-warn">{t.last_note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={t.active}
                    onCheckedChange={(on) => toggle(t, on)}
                    disabled={!t.active && full}
                    aria-label={t.active ? `Pause ${t.label}` : `Resume ${t.label}`}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(t)} aria-label={`Remove ${t.label}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-muted-foreground">No keywords yet. Start with your brand name, then add one or two competitors.</p>
        )}
      </Panel>

      <div className="space-y-4 lg:col-span-2">
        <Panel title="Add a keyword">
          <form onSubmit={add} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lk-kind">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as TopicKind)}>
                <SelectTrigger id="lk-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as TopicKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">{KIND_HINT[kind]}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lk-query">Search for</Label>
              <Input id="lk-query" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={80} placeholder={kind === "competitor" ? "e.g. Brand X" : "e.g. #MyBrand"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lk-label">Name it (optional)</Label>
              <Input id="lk-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="How it shows on the charts" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lk-exclude">Skip posts that mention (optional)</Label>
              <Input id="lk-exclude" value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="Comma separated, e.g. jobs, vacancy" />
            </div>
            <Button type="submit" size="sm" disabled={saving || full}>{full ? `Limit of ${MAX_ACTIVE_TOPICS} reached` : saving ? "Adding…" : "Add keyword"}</Button>
          </form>
        </Panel>

        <ListeningAlerts clientId={clientId} brandName={brandName} canEdit={canEditAlerts} />

        <Panel title="How it works">
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            <li>Each keyword is searched on TikTok, Instagram, YouTube and Reddit twice a day, and new keywords within the hour.</li>
            <li>AI reads every post for its mood and theme, in English, Kiswahili or Sheng, and sets aside posts that aren't about the keyword.</li>
            {showCredits && (
              <li>
                One search costs {CREDITS_PER_SEARCH} ScrapeCreators credits. Your agency's brands share {DAILY_CREDITS} a day
                {creditsToday !== null ? <> · <span className="tabular-nums text-foreground">{creditsToday}</span> used today</> : null}.
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
