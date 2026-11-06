// The database side of adding creators. What to write is decided in creatorCandidates.ts, which has no database in it.
import { supabase } from "@/integrations/supabase/client";
import { breakdownTotal, DEFAULT_PLATFORMS, normalizeBreakdown, type Breakdown } from "@/components/DeliverablesEditor";
import { candidateFromListed, candidateFromProfiles, groupProfiles, planRosterWrite, type Candidate } from "@/lib/creatorCandidates";
import { accountKey, personNameKey } from "@/lib/creatorAccounts";
import type { ListedCreator } from "@/lib/creatorList";

/* eslint-disable @typescript-eslint/no-explicit-any -- influencers.account_stats isn't in the generated types until the migration runs. */

/** Puts these people on the roster, or adds to their row when they are on it. A failure doesn't stop the others. */
export async function saveToRoster(candidates: Candidate[], agencyId?: string | null) {
  const saved: { key: string; row: any }[] = [];
  const failed: { name: string; message: string }[] = [];
  for (const c of candidates) {
    const plan = planRosterWrite(c, c.existing);
    if (!plan) {
      saved.push({ key: c.key, row: c.existing });
      continue;
    }
    const table = supabase.from("influencers") as any;
    const { data, error } = plan.id
      ? await table.update(plan.values).eq("id", plan.id).select().single()
      : await table.insert(agencyId ? { ...plan.values, agency_id: agencyId } : plan.values).select().single();
    if (error) failed.push({ name: c.full_name, message: error.message });
    else saved.push({ key: c.key, row: data });
  }
  return { saved, failed };
}

/** Adds them to a campaign. Anyone already on it keeps their fee and deliverables, so this is safe to repeat. */
export async function addToCampaign(campaignId: string, entries: { influencer_id: string; fee: number }[], breakdown: Breakdown) {
  const total = breakdownTotal(breakdown);
  const deliverables = total > 0 ? normalizeBreakdown(breakdown) : { items: [{ type: "video", count: 1, platforms: [...DEFAULT_PLATFORMS] }] };
  const rows = entries.map((e) => ({
    campaign_id: campaignId,
    influencer_id: e.influencer_id,
    fee_kes: e.fee,
    deliverables_count: total > 0 ? total : 1,
    deliverables_breakdown: deliverables as any,
  }));
  const { data, error } = await supabase
    .from("campaign_influencers")
    .upsert(rows, { onConflict: "campaign_id,influencer_id", ignoreDuplicates: true })
    .select();
  return { added: data?.length ?? 0, error: error?.message ?? null };
}

async function loadContacts(ids: string[]) {
  if (!ids.length) return [];
  const { data } = await supabase.from("discovery_contacts").select("*").in("creator_id", ids);
  return (data as any[]) ?? [];
}

/** Everyone with these names, because a person's other accounts may not have matched the search or the page's filters. */
async function withSiblings(profiles: any[]) {
  const names = [...new Set(profiles.map((p) => p.full_name).filter(Boolean))];
  if (!names.length) return profiles;
  const { data } = await supabase.from("discovery_creators").select("*").in("full_name", names).limit(500);
  const byId = new Map<string, any>();
  for (const p of [...profiles, ...((data as any[]) ?? [])]) byId.set(p.id, p);
  return [...byId.values()];
}

/** Discovery profiles as people, each with all their accounts and the contacts this user may read. */
export async function peopleFromProfiles(profiles: any[]): Promise<Candidate[]> {
  const all = await withSiblings(profiles);
  const contacts = await loadContacts(all.map((p) => p.id));
  return groupProfiles(all).map((group) => candidateFromProfiles(group, contacts));
}

/** A search across Discovery, biggest accounts first, as people. */
export async function searchDiscovery(query: string): Promise<Candidate[]> {
  // These characters would break the "or" filter's syntax, and no name or handle needs them to be found.
  const q = query.trim().replace(/^@+/, "").replace(/[%,()*]/g, " ").trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("discovery_creators")
    .select("*")
    .or(`full_name.ilike.%${q}%,handle.ilike.%${q}%`)
    .order("follower_count", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return peopleFromProfiles((data as any[]) ?? []);
}

/** A pasted list as candidates, filled in from Discovery where it knows the person. */
export async function candidatesFromList(listed: ListedCreator[]): Promise<Candidate[]> {
  const handles = [...new Set(listed.flatMap((l) => l.accounts.filter((a) => a.readable).map((a) => a.handle)))];
  const names = [...new Set(listed.map((l) => l.name).filter(Boolean) as string[])];
  const found: any[] = [];
  if (handles.length) {
    const { data } = await supabase.from("discovery_creators").select("*").in("handle", handles).limit(1000);
    found.push(...((data as any[]) ?? []));
  }
  if (names.length) {
    const { data } = await supabase.from("discovery_creators").select("*").in("full_name", names).limit(1000);
    found.push(...((data as any[]) ?? []));
  }
  const people = found.length ? await peopleFromProfiles(found) : [];
  const byAccount = new Map(people.flatMap((p) => p.accounts.map((a) => [accountKey(a.platform, a.handle), p] as const)));
  const byName = new Map(people.map((p) => [personNameKey(p.full_name), p] as const));
  return listed.map((l) => {
    const viaAccount = l.accounts.map((a) => byAccount.get(accountKey(a.platform, a.handle))).find(Boolean);
    return candidateFromListed(l, viaAccount ?? byName.get(personNameKey(l.name)) ?? null);
  });
}
