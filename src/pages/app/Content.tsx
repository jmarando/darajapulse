import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, LayoutGrid, List } from "lucide-react";
import { ContentSection } from "./ContentSection";

const Content = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [params, setParams] = useSearchParams();
  const selected = params.get("campaign") ?? "all";
  const [view, setView] = useState<"calendar" | "all">(selected === "all" ? "all" : "calendar");

  useEffect(() => {
    (async () => {
      const { data: cs } = await supabase
        .from("campaigns")
        .select("id, name, status, clients(name, slug)")
        .order("created_at", { ascending: false });
      setCampaigns(cs ?? []);
    })();
  }, []);

  useEffect(() => {
    if (selected === "all") {
      (async () => {
        const { data } = await supabase
          .from("content_items")
          .select("*, influencers(full_name, handle), campaigns(id, name, clients(name))")
          .order("scheduled_for", { ascending: true, nullsFirst: false });
        setAllItems(data ?? []);
      })();
      setView("all");
    } else {
      (async () => {
        const { data } = await supabase
          .from("campaign_influencers")
          .select("influencer_id, influencers(full_name, handle)")
          .eq("campaign_id", selected);
        setRoster(data ?? []);
      })();
      setView("calendar");
    }
  }, [selected]);

  const tone: Record<string, string> = {
    drafted: "bg-muted text-muted-foreground border-border",
    in_review: "bg-highlight/20 text-foreground border-highlight/40",
    approved: "bg-success/15 text-success border-success/30",
    scheduled: "bg-accent text-accent-foreground border-accent",
    posted: "bg-primary text-primary-foreground border-primary",
  };

  const grouped = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of allItems) {
      const k = it.campaigns?.name ?? "Unassigned";
      const arr = m.get(k) ?? [];
      arr.push(it);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [allItems]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Production</div>
          <h1 className="font-display text-3xl flex items-center gap-2"><Calendar className="w-6 h-6" /> Content management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One place to plan, upload, review and approve content across every campaign calendar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selected} onValueChange={(v) => setParams(v === "all" ? {} : { campaign: v })}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Pick a calendar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns (overview)</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.clients?.name ? `${c.clients.name} · ` : ""}{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {view === "calendar" && selected !== "all" && (
        <ContentSection campaignId={selected} roster={roster} />
      )}

      {view === "all" && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <LayoutGrid className="w-4 h-4 text-muted-foreground" />
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">All content · {allItems.length} items</div>
          </div>
          {grouped.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-md">
              <p className="text-sm text-muted-foreground">No content items yet. Pick a campaign above to start a calendar.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([name, items]) => (
                <div key={name}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display text-lg">{name}</h3>
                    {items[0]?.campaigns?.id && (
                      <Link to={`/app/content?campaign=${items[0].campaigns.id}`} className="text-xs text-accent hover:underline">
                        Open calendar →
                      </Link>
                    )}
                  </div>
                  <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map(it => (
                      <li key={it.id} className="p-4 rounded-md border border-border">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{it.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                              {it.influencers?.full_name ?? "Unassigned"} · {it.platform}
                            </div>
                          </div>
                          <Badge variant="outline" className={`capitalize ${tone[it.status] ?? ""}`}>{it.status?.replace("_"," ")}</Badge>
                        </div>
                        {it.scheduled_for && (
                          <div className="text-[11px] text-muted-foreground mt-2">📅 {new Date(it.scheduled_for).toLocaleString()}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default Content;
