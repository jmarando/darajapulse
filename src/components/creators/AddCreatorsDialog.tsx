import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DeliverablesEditor, type Breakdown } from "@/components/DeliverablesEditor";
import { useAuth } from "@/hooks/useAuth";
import { accountsOf, CREATOR_PLATFORMS } from "@/lib/creatorAccounts";
import { candidateFromInventory, candidateFromRow, defaultBreakdown, planRosterWrite, resolveCandidate, type Candidate } from "@/lib/creatorCandidates";
import { parseCreatorList } from "@/lib/creatorList";
import { addToCampaign, candidatesFromList, saveToRoster, searchDiscovery } from "@/lib/creatorSave";
import { AccountChip, AccountChips } from "./AccountChips";
import { CreatorForm } from "./CreatorForm";

/* eslint-disable @typescript-eslint/no-explicit-any -- roster and storefront rows are read loosely across this app. */

type TargetCampaign = { id: string; name: string; agency_id: string };
type Step = "pick" | "create" | "paste" | "review";
type Source = "roster" | "discovery" | "storefront";

const MAX_LISTED = 100;
const STOREFRONT_KINDS: Record<string, string> = { influencer: "Creator", owned_account: "Channel", ad_slot: "Ad slot", bundle: "Bundle" };

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/**
 * Adding creators, from anywhere: pick several at once, from the roster, Discovery, the storefront or a pasted list, look
 * them over, and put them on the roster and a campaign in one step. Open it from a campaign page with `campaign`, or
 * with people already chosen elsewhere as `initial`. Render it only while open, so each opening starts clean.
 */
export function AddCreatorsDialog({ open, onOpenChange, campaign, roster, inventory = [], onCampaign, initial, startAt, onDone }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The campaign to add to. Without one the review offers a choice of campaigns, or the roster alone. */
  campaign?: TargetCampaign | null;
  roster: any[];
  inventory?: any[];
  /** Who is already on this campaign, so they aren't offered again. */
  onCampaign?: Set<string>;
  initial?: Candidate[];
  startAt?: "paste";
  onDone: () => void;
}) {
  const { agencyIds } = useAuth();
  const [step, setStep] = useState<Step>(startAt ?? (initial?.length ? "review" : "pick"));
  const [source, setSource] = useState<Source>("roster");
  const [picks, setPicks] = useState<Candidate[]>(initial ?? []);
  const [createdRows, setCreatedRows] = useState<any[]>([]);
  const [savedRows, setSavedRows] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [kind, setKind] = useState("");
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [discoveryResults, setDiscoveryResults] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteFallback, setPasteFallback] = useState("tiktok");
  const [reading, setReading] = useState(false);
  const [unread, setUnread] = useState<{ line: string; problem: string | null }[]>([]);
  const [campaigns, setCampaigns] = useState<(TargetCampaign & { status?: string })[]>([]);
  const [chosenCampaignId, setChosenCampaignId] = useState("");
  const [fee, setFee] = useState("");
  const [fees, setFees] = useState<Record<string, string>>({});
  const [breakdown, setBreakdown] = useState<Breakdown>(() => defaultBreakdown(initial ?? []));
  const [samePerson, setSamePerson] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (campaign) return;
    (async () => {
      const { data } = await supabase.from("campaigns").select("id, name, status, agency_id").order("created_at", { ascending: false });
      setCampaigns((data as any[]) ?? []);
    })();
  }, [campaign]);

  const target = campaign ?? campaigns.find((c) => c.id === chosenCampaignId) ?? null;
  const agencyId = target?.agency_id ?? (agencyIds.length === 1 ? agencyIds[0] : null);
  const allRows = useMemo(() => [...roster, ...createdRows], [roster, createdRows]);

  const offeredRows = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^@/, "");
    return allRows
      .filter((r) => !agencyId || r.agency_id === agencyId)
      .filter((r) => !onCampaign?.has(r.id))
      .filter((r) => {
        const accounts = accountsOf(r);
        if (platform && !accounts.some((a) => a.platform === platform)) return false;
        if (!q) return true;
        const text = [r.full_name, r.niche, r.city, ...accounts.map((a) => a.handle)].filter(Boolean).join(" ").toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  }, [allRows, agencyId, onCampaign, search, platform]);

  const offeredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory
      .filter((i) => !kind || i.kind === kind)
      .filter((i) => !q || `${i.title} ${i.handle ?? ""} ${(i.tags ?? []).join(" ")}`.toLowerCase().includes(q));
  }, [inventory, kind, search]);

  const isPicked = (key: string) => picks.some((p) => p.key === key);
  const togglePick = (c: Candidate) => setPicks((all) => (all.some((p) => p.key === c.key) ? all.filter((p) => p.key !== c.key) : [...all, c]));
  const toggleAccount = (key: string, index: number) => setPicks((all) => all.map((p) => (
    p.key === key ? { ...p, accounts: p.accounts.map((a, i) => (i === index ? { ...a, on: !a.on } : a)) } : p
  )));

  const goToReview = (next: Candidate[] = picks) => {
    setBreakdown(defaultBreakdown(next));
    setStep("review");
  };

  const runDiscoverySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    try {
      setDiscoveryResults(await searchDiscovery(discoveryQuery));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't search Discovery");
    } finally {
      setSearching(false);
    }
  };

  const readList = async () => {
    const listed = parseCreatorList(pasted, pasteFallback);
    if (!listed.length) return toast.error("Paste at least one line.");
    setReading(true);
    try {
      const usable = listed.filter((l) => l.name || l.accounts.length);
      setUnread(listed.filter((l) => !l.name && !l.accounts.length).map((l) => ({ line: l.line, problem: l.problem })));
      const candidates = await candidatesFromList(usable);
      const seen = new Set(picks.map((p) => p.key));
      const next = [...picks, ...candidates.filter((c) => !seen.has(c.key) && seen.add(c.key))];
      setPicks(next);
      goToReview(next);
    } finally {
      setReading(false);
    }
  };

  // Who each person is on the roster, worked out afresh as the campaign (and so the agency) changes.
  const reviewed = useMemo(() => picks.map((pick) => {
    const resolved = resolveCandidate(pick, allRows, agencyId);
    if (savedRows[pick.key]) return { ...resolved, existing: savedRows[pick.key], certain: true };
    if (resolved.certain || !(pick.key in samePerson)) return resolved;
    return { ...resolved, existing: samePerson[pick.key] ? resolved.existing ?? resolved.nameMatch : null };
  }), [picks, allRows, agencyId, savedRows, samePerson]);

  const nothingToDo = !target && reviewed.every((c) => !planRosterWrite(c, c.existing));

  const submit = async () => {
    setSaving(true);
    try {
      const { saved, failed } = await saveToRoster(reviewed, agencyId);
      // Remembered so another press can't make a second row for anyone saved this time.
      setSavedRows((all) => ({ ...all, ...Object.fromEntries(saved.map((s) => [s.key, s.row])) }));
      if (failed.length) {
        toast.error(`Couldn't save ${failed.map((f) => f.name).join(", ")}: ${failed[0].message}`);
        return;
      }
      const noEmail = saved.filter((s) => !s.row?.email).length;
      if (target) {
        const entries = reviewed.map((c) => ({
          influencer_id: saved.find((s) => s.key === c.key)?.row.id as string,
          fee: Number(fees[c.key]) || c.fee || Number(fee) || 0,
        }));
        const unique = [...new Map(entries.map((e) => [e.influencer_id, e])).values()];
        const { added, error } = await addToCampaign(target.id, unique, breakdown);
        if (error) {
          toast.error(error);
          return;
        }
        toast.success(`Added ${added} to ${target.name}`);
      } else {
        toast.success(`${reviewed.length} on the roster`);
      }
      if (noEmail) toast.message(`${noEmail} ${noEmail === 1 ? "has" : "have"} no email, so briefs and invites can't reach them until you add one.`);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const statusOf = (c: Candidate) => {
    if (savedRows[c.key]) return "Saved";
    if (c.existing && c.certain) {
      const plan = planRosterWrite(c, c.existing);
      return plan?.values.alt_handles ? "Already on your roster. Adds their new accounts." : "Already on your roster.";
    }
    return c.existing || c.nameMatch ? null : "New creator";
  };

  const title = {
    pick: target ? `Add creators to ${target.name}` : "Add creators",
    create: "Create new influencer",
    paste: "Paste a list",
    review: "Check and add",
  }[step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        {step === "create" && (
          <CreatorForm
            agencyId={agencyId}
            roster={allRows}
            onCancel={() => setStep("pick")}
            onSaved={(row) => {
              setCreatedRows((all) => [...all.filter((r) => r.id !== row.id), row]);
              setPicks((all) => [...all.filter((p) => p.key !== `row:${row.id}`), candidateFromRow(row)]);
              setSource("roster");
              setStep("pick");
            }}
          />
        )}

        {step === "paste" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">One creator per line. Profile links, @handles and names all work, and so do rows copied from a sheet with its heading row.</p>
            <Textarea aria-label="Paste your list" rows={9} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"Jane Cooks, https://www.tiktok.com/@janecooks, https://www.instagram.com/jane.ig\n@brian.o\nMercy Wanjiru"} />
            <label className="flex flex-wrap items-center gap-2 text-sm">
              Handles with no link are on
              <select className={selectClass} value={pasteFallback} onChange={(e) => setPasteFallback(e.target.value)}>
                {CREATOR_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("pick")}>Back</Button>
              <Button type="button" className="flex-1 bg-primary" disabled={reading || !pasted.trim()} onClick={() => void readList()}>
                {reading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Read list
              </Button>
            </div>
          </div>
        )}

        {step === "pick" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" size="sm" variant={source === "roster" ? "default" : "outline"} onClick={() => { setSource("roster"); setSearch(""); }}>My roster</Button>
              <Button type="button" size="sm" variant={source === "discovery" ? "default" : "outline"} onClick={() => setSource("discovery")}>Discovery</Button>
              {inventory.length > 0 && <Button type="button" size="sm" variant={source === "storefront" ? "default" : "outline"} onClick={() => { setSource("storefront"); setSearch(""); }}>Storefront</Button>}
              <span className="flex-1" />
              <Button type="button" size="sm" variant="ghost" onClick={() => setStep("paste")}>Paste a list</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setStep("create")}><Plus className="mr-1 h-3.5 w-3.5" /> Create new</Button>
            </div>

            {source === "roster" && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Input aria-label="Search your roster" className="min-w-[180px] flex-1" placeholder="Name, any handle, niche, city…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select aria-label="Platform filter" className={selectClass} value={platform} onChange={(e) => setPlatform(e.target.value)}>
                    <option value="">Any platform</option>
                    {CREATOR_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{offeredRows.length} on your roster{onCampaign?.size ? " and not on this campaign" : ""}</span>
                  {offeredRows.length > 0 && offeredRows.length <= MAX_LISTED && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => setPicks((all) => {
                        const have = new Set(all.map((p) => p.key));
                        return [...all, ...offeredRows.map(candidateFromRow).filter((c) => !have.has(c.key))];
                      })}
                    >
                      Select all shown
                    </Button>
                  )}
                </div>
                <div className="max-h-80 space-y-1 overflow-auto">
                  {offeredRows.slice(0, MAX_LISTED).map((r) => {
                    const c = candidateFromRow(r);
                    return <PickRow key={r.id} candidate={c} picked={isPicked(c.key)} onToggle={() => togglePick(c)} />;
                  })}
                  {offeredRows.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">Nobody here matches. Try Discovery, or create them.</p>}
                  {offeredRows.length > MAX_LISTED && <p className="p-2 text-center text-xs text-muted-foreground">Showing the first {MAX_LISTED}. Search to narrow it down.</p>}
                </div>
              </>
            )}

            {source === "discovery" && (
              <>
                <form onSubmit={(e) => void runDiscoverySearch(e)} className="flex gap-2">
                  <Input aria-label="Search Discovery" className="flex-1" placeholder="Name or handle…" value={discoveryQuery} onChange={(e) => setDiscoveryQuery(e.target.value)} />
                  <Button type="submit" variant="secondary" disabled={searching || discoveryQuery.trim().length < 2} aria-label="Search">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </form>
                <div className="max-h-80 space-y-1 overflow-auto">
                  {(discoveryResults ?? []).map((c) => {
                    const known = resolveCandidate(c, allRows, agencyId);
                    return <PickRow key={c.key} candidate={c} picked={isPicked(c.key)} onToggle={() => togglePick(c)} tag={known.existing && known.certain ? "On your roster" : undefined} />;
                  })}
                  {discoveryResults?.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">Nobody found. Paste their links, or create them.</p>}
                  {discoveryResults === null && <p className="p-3 text-center text-sm text-muted-foreground">Search everyone in Discovery. Adding someone puts them on your roster too.</p>}
                </div>
              </>
            )}

            {source === "storefront" && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Input aria-label="Search the storefront" className="min-w-[180px] flex-1" placeholder="Search inventory…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select aria-label="Type" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="">All types</option>
                    {Object.entries(STOREFRONT_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </div>
                <div className="max-h-80 space-y-1 overflow-auto">
                  {offeredInventory.map((i) => {
                    const c = candidateFromInventory(i);
                    return <PickRow key={i.id} candidate={c} picked={isPicked(c.key)} onToggle={() => togglePick(c)} tag={STOREFRONT_KINDS[i.kind] ?? i.kind} />;
                  })}
                  {offeredInventory.length === 0 && (
                    <p className="p-3 text-center text-sm text-muted-foreground">Nothing here. Add channels and creators in <Link to="/app/inventory" className="underline">Storefront</Link>.</p>
                  )}
                </div>
              </>
            )}

            <Button type="button" className="w-full bg-primary" disabled={picks.length === 0} onClick={() => goToReview()}>
              Continue with {picks.length}
            </Button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            {!campaign && (
              <div>
                <Label htmlFor="add-to-campaign">Campaign</Label>
                <select id="add-to-campaign" className={`${selectClass} mt-1 w-full`} value={chosenCampaignId} onChange={(e) => setChosenCampaignId(e.target.value)}>
                  <option value="">Roster only</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status ? ` (${c.status})` : ""}</option>)}
                </select>
              </div>
            )}

            {target && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="add-fee">Fee for each (KES)</Label>
                  <Input id="add-fee" className="mt-1" type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
                  <p className="mt-1 text-[11px] text-muted-foreground">Type a different fee on anyone below.</p>
                </div>
                <div>
                  <Label>Deliverables across platforms</Label>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">One combined brief covers all of them, with no separate invites.</p>
                  <div className="mt-1.5"><DeliverablesEditor value={breakdown} onChange={setBreakdown} /></div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {reviewed.map((c, index) => {
                const status = statusOf(c);
                const person = picks[index];
                return (
                  <div key={c.key} className="rounded-md border border-border p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{c.full_name}</div>
                        {status && <div className="text-[11px] text-muted-foreground">{status}</div>}
                        {!c.certain && !savedRows[c.key] && (c.existing || c.nameMatch) && (
                          <label className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            Same name as someone on your roster:
                            <select
                              className="h-7 rounded-md border border-input bg-background px-1 text-[11px]"
                              value={c.existing ? "same" : "new"}
                              onChange={(e) => setSamePerson((all) => ({ ...all, [c.key]: e.target.value === "same" }))}
                            >
                              <option value="same">Same person, add to them</option>
                              <option value="new">Different person, new row</option>
                            </select>
                          </label>
                        )}
                      </div>
                      {target && (
                        <Input
                          aria-label={`Fee for ${c.full_name}`}
                          className="h-8 w-24 shrink-0"
                          type="number"
                          placeholder={c.fee ? String(c.fee) : fee || "Fee"}
                          value={fees[c.key] ?? ""}
                          onChange={(e) => setFees((all) => ({ ...all, [c.key]: e.target.value }))}
                        />
                      )}
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Take ${c.full_name} off this list`} onClick={() => togglePick(person)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {person.key.startsWith("row:") ? (
                      // Already on the roster as they are, so there's nothing to choose. Their profile is where accounts change.
                      <div className="mt-2"><AccountChips accounts={person.accounts} /></div>
                    ) : person.accounts.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {person.accounts.map((a, i) => (
                          <label key={`${a.platform}:${a.handle}`} className="inline-flex max-w-full items-center gap-1.5">
                            <Checkbox aria-label={`${a.platform} ${a.handle}`} checked={a.on} onCheckedChange={() => toggleAccount(person.key, i)} />
                            <AccountChip account={a} />
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-muted-foreground">No handle yet. You can add one from their profile later.</p>
                    )}
                    <div className="mt-2 text-[11px]">
                      {c.existing?.email || c.email
                        ? <span className="text-muted-foreground">{c.existing?.email || c.email}</span>
                        : <span className="text-destructive">No email yet, so Broadcast can't reach them.</span>}
                      {(c.existing?.phone_mpesa || c.phone) && <span className="text-muted-foreground"> · {c.existing?.phone_mpesa || c.phone}</span>}
                    </div>
                    {c.problem && <p className="mt-1 text-[11px] text-destructive">{c.problem}</p>}
                  </div>
                );
              })}
              {reviewed.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">Nobody on the list yet.</p>}
            </div>

            {unread.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-3 text-[11px]">
                <p className="font-medium text-destructive">These lines couldn't be read and were left out:</p>
                <ul className="mt-1 space-y-1">
                  {unread.map((u) => <li key={u.line} className="break-all"><span className="font-mono">{u.line}</span>{u.problem ? ` (${u.problem})` : ""}</li>)}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={saving} onClick={() => setStep("pick")}>Add more</Button>
              <Button type="button" className="flex-1 bg-primary" disabled={saving || reviewed.length === 0 || nothingToDo} onClick={() => void submit()}>
                {saving ? "Adding…" : `Add ${reviewed.length} to ${target ? target.name : "roster"}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickRow({ candidate, picked, onToggle, tag }: { candidate: Candidate; picked: boolean; onToggle: () => void; tag?: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-md p-2.5 hover:bg-secondary ${picked ? "bg-secondary/60" : ""}`}>
      <Checkbox aria-label={`Select ${candidate.full_name}`} checked={picked} onCheckedChange={onToggle} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{candidate.full_name}</span>
          {tag && <Badge variant="outline" className="shrink-0 text-[9px]">{tag}</Badge>}
        </span>
        <span className="mt-1 block"><AccountChips accounts={candidate.accounts} max={3} /></span>
      </span>
    </label>
  );
}
