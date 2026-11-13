import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ago, kes } from "@/lib/storefrontRequests";

type Row = {
  id: string; company: string | null; contact_name: string; budget_kes: number | null; status: string; created_at: string;
  items: { title?: string }[] | null; agencies: { name: string; slug: string } | null;
};

/**
 * Open storefront quote requests on the dashboard, newest first, each linking to its storefront's Requests tab.
 * Shows nothing for workspaces with no storefront requests.
 */
export default function RequestsOverviewCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("inventory_bookings")
        .select("id, company, contact_name, budget_kes, status, created_at, items, agencies(name, slug)")
        .in("status", ["new", "reviewing", "quoted"])
        .order("created_at", { ascending: false })
        .limit(4);
      setRows((data as unknown as Row[]) ?? []);
    })();
  }, []);
  if (!rows || rows.length === 0) return null;
  const fresh = rows.filter((r) => r.status === "new").length;
  return (
    <section className="mb-4 rounded-[16px] border border-border/70 bg-card p-4" aria-labelledby="storefront-requests-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="storefront-requests-title" className="inline-flex items-center gap-2 text-[14px] font-medium">
          <Inbox className="h-4 w-4" aria-hidden /> Storefront requests
          {fresh > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">{fresh} new</span>}
        </h2>
        <Link to={`/app/inventory?tab=requests${rows[0].agencies?.slug ? `&agency=${rows[0].agencies.slug}` : ""}`} className="text-[12.5px] text-muted-foreground hover:text-foreground">Open requests</Link>
      </div>
      <ul className="mt-2 divide-y divide-border/70">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={`/app/inventory?tab=requests${r.agencies?.slug ? `&agency=${r.agencies.slug}` : ""}`} className="group flex items-center justify-between gap-3 rounded-lg py-2.5 hover:bg-secondary/40">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium">{r.company || r.contact_name}</div>
                <div className="truncate text-[12.5px] text-muted-foreground">
                  {(r.items ?? []).length} item{(r.items ?? []).length === 1 ? "" : "s"}{r.agencies?.name ? ` · ${r.agencies.name}` : ""} · {ago(r.created_at)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[12.5px] text-muted-foreground">
                <span className="tabular-nums">{r.budget_kes ? kes(r.budget_kes) : ""}</span>
                <span className="capitalize">{r.status}</span>
                <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
