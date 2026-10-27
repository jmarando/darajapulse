import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Megaphone, Search, User, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DialogTitle } from "@/components/ui/dialog";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type Page = { to: string; label: string; icon: LucideIcon };
type Results = {
  campaigns: { id: string; name: string; status: string | null; client: string | null }[];
  creators: { id: string; name: string; handle: string | null }[];
  clients: { id: string; name: string }[];
};

type CampaignRow = { id: string; name: string; status: string | null; clients: { name: string } | null };
type CreatorRow = { id: string; full_name: string | null; handle: string | null };

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The sidebar search box and the ⌘K palette it opens: pages, campaigns, creators and clients. */
export function GlobalSearch({ pages, compact = false }: { pages: Page[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Results | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    (async () => {
      const [c, i, cl] = await Promise.all([
        supabase.from("campaigns").select("id, name, status, clients(name)").order("created_at", { ascending: false }).limit(500),
        supabase.from("influencers").select("id, full_name, handle").order("full_name").limit(2000),
        supabase.from("clients").select("id, name").order("name").limit(500),
      ]);
      if (cancelled) return;
      setData({
        campaigns: ((c.data ?? []) as CampaignRow[]).map((r) => ({ id: r.id, name: r.name, status: r.status, client: r.clients?.name ?? null })),
        creators: ((i.data ?? []) as CreatorRow[]).map((r) => ({ id: r.id, name: r.full_name || r.handle || "Unnamed creator", handle: r.handle })),
        clients: ((cl.data ?? []) as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name })),
      });
    })();
    return () => { cancelled = true; };
  }, [open, data]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className={cn(
          "flex items-center gap-2 rounded-[10px] border border-border/80 bg-raised text-[13.5px] text-muted-foreground shadow-[0_1px_1px_hsl(240_6%_10%/0.03)] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "h-9 w-9 justify-center" : "h-9 w-full px-3",
        )}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        {!compact && (
          <>
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded-[6px] border border-border bg-secondary px-1.5 py-px font-sans text-[11px] text-muted-foreground">{isMac() ? "⌘K" : "Ctrl K"}</kbd>
          </>
        )}
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <CommandInput placeholder="Search campaigns, creators and clients" />
        <CommandList>
          <CommandEmpty>{data ? "Nothing matches that." : "Loading…"}</CommandEmpty>
          <CommandGroup heading="Go to">
            {pages.map((p) => (
              <CommandItem key={p.to} value={`page ${p.label}`} onSelect={() => go(p.to)}>
                <p.icon className="mr-2 text-muted-foreground" /> {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {data && data.campaigns.length > 0 && (
            <CommandGroup heading="Campaigns">
              {data.campaigns.map((c) => (
                <CommandItem key={c.id} value={`campaign ${c.name} ${c.client ?? ""} ${c.id}`} onSelect={() => go(`/app/campaigns/${c.id}`)}>
                  <Megaphone className="mr-2 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.client && <span className="ml-2 truncate text-[12px] text-muted-foreground">{c.client}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {data && data.creators.length > 0 && (
            <CommandGroup heading="Creators">
              {data.creators.map((c) => (
                <CommandItem key={c.id} value={`creator ${c.name} ${c.handle ?? ""} ${c.id}`} onSelect={() => go(`/app/influencers?q=${encodeURIComponent(c.handle || c.name)}`)}>
                  <User className="mr-2 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.handle && <span className="ml-2 truncate text-[12px] text-muted-foreground">@{c.handle.replace(/^@/, "")}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {data && data.clients.length > 0 && (
            <CommandGroup heading="Clients">
              {data.clients.map((c) => (
                <CommandItem key={c.id} value={`client ${c.name} ${c.id}`} onSelect={() => go("/app/clients")}>
                  <Building2 className="mr-2 text-muted-foreground" /> {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
