// Someone about to go on the roster or a campaign, wherever they came from: Discovery, the roster itself, the storefront
// or a pasted list. They all become a Candidate, so one review step and one save can handle every route in.
import {
  accountsOf,
  accountsToColumns,
  matchRoster,
  mergeAccounts,
  personNameKey,
  storedAccount,
  TRACKED_PLATFORMS,
  type CreatorAccount,
} from "@/lib/creatorAccounts";
import type { ListedCreator } from "@/lib/creatorList";

/* eslint-disable @typescript-eslint/no-explicit-any -- roster, Discovery and storefront rows are read loosely across this app. */

export type CandidateAccount = CreatorAccount & { on: boolean };
export type Candidate = {
  key: string;
  full_name: string;
  accounts: CandidateAccount[];
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  niche: string | null;
  region: string | null;
  city: string | null;
  country_code: string | null;
  notes?: string | null;
  /** A suggested fee, from a storefront item's rate. */
  fee?: number | null;
  /** A line in a pasted list that couldn't be fully read. */
  problem?: string | null;
  /** Who they are on the roster, when known. Their row gets the new accounts, instead of a second row. */
  existing: any | null;
  /** True when `existing` was found by account, false when it is a guess from the name. */
  certain: boolean;
  /** Someone with the same one-word name: too weak to assume, so the review asks. */
  nameMatch?: any | null;
};

const positive = (n: unknown) => (Number(n) > 0 ? Number(n) : null);
const firstOf = <T,>(items: T[], read: (item: T) => string | null | undefined) => items.map(read).find(Boolean) ?? null;

export function groupProfiles<P extends { id: string; full_name?: string | null }>(profiles: P[]): P[][] {
  const groups = new Map<string, P[]>();
  for (const p of profiles) {
    const key = personNameKey(p.full_name) || `id:${p.id}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()];
}

/** One person from Discovery, from their profiles (one per account) and whatever contacts this user may read. */
export function candidateFromProfiles(profiles: any[], contacts: any[]): Candidate {
  const ids = new Set(profiles.map((p) => p.id));
  const mine = contacts.filter((c) => ids.has(c.creator_id));
  const contact = (...kinds: string[]) => {
    for (const kind of kinds) {
      const found = mine.find((c) => c.kind === kind && c.value?.trim());
      if (found) return String(found.value).trim();
    }
    return null;
  };

  // A WhatsApp row's handle is a phone number, which already comes through as a contact.
  const biggestFirst = [...profiles]
    .filter((p) => p.platform !== "whatsapp")
    .sort((a, b) => Number(b.follower_count || 0) - Number(a.follower_count || 0));
  const seen = new Set<string>();
  const platformsTaken = new Set<string>();
  const accounts: CandidateAccount[] = [];
  for (const p of biggestFirst) {
    const account = storedAccount(p.handle ?? "", p.platform);
    const key = `${account.platform}:${account.handle.toLowerCase()}`;
    if (!account.handle || seen.has(key)) continue;
    seen.add(key);
    // Names group the wrong person now and then, so a second account on one platform waits to be ticked.
    const on = !platformsTaken.has(account.platform);
    platformsTaken.add(account.platform);
    accounts.push({ ...account, followers: positive(p.follower_count), engagement: positive(p.engagement_rate), on });
  }

  const email = contact("email", "manager_email")?.toLowerCase() ?? null;
  const phone = contact("whatsapp", "phone")?.replace(/\D/g, "") || null;
  const ordered = biggestFirst.length ? biggestFirst : profiles;
  const niches = [...new Set(ordered.flatMap((p) => p.niche ?? []))];
  return {
    key: `person:${personNameKey(ordered[0]?.full_name) || ordered[0]?.id}`,
    full_name: ordered[0]?.full_name ?? "",
    accounts,
    email,
    phone,
    avatar_url: firstOf(ordered, (p) => p.avatar_url),
    niche: niches.length ? niches.join(", ") : null,
    region: firstOf(ordered, (p) => p.region),
    city: firstOf(ordered, (p) => p.city),
    country_code: firstOf(ordered, (p) => p.country_code),
    existing: null,
    certain: false,
  };
}

/** Someone already on the roster, as they are. */
export function candidateFromRow(row: any): Candidate {
  return {
    key: `row:${row.id}`,
    full_name: row.full_name,
    accounts: accountsOf(row).map((a) => ({ ...a, on: true })),
    email: row.email ?? null,
    phone: row.phone_mpesa ?? null,
    avatar_url: row.avatar_url ?? null,
    niche: row.niche ?? null,
    region: row.region ?? null,
    city: row.city ?? null,
    country_code: row.country_code ?? null,
    existing: row,
    certain: true,
  };
}

/** A storefront item, with its rate as the suggested fee. A TV or radio slot has no account to record. */
export function candidateFromInventory(item: any): Candidate {
  const known = TRACKED_PLATFORMS.includes(item.platform) ? item.platform : undefined;
  const accounts: CandidateAccount[] = [];
  if (item.handle?.trim()) {
    const account = storedAccount(item.handle, known ?? "");
    if (account.platform) accounts.push({ ...account, followers: positive(item.follower_count), engagement: positive(item.engagement_rate), on: true });
  }
  return {
    key: `inv:${item.id}`,
    full_name: item.title,
    accounts,
    email: null,
    phone: null,
    avatar_url: item.cover_url ?? null,
    niche: Array.isArray(item.tags) && item.tags.length ? item.tags.join(", ") : null,
    region: null,
    city: null,
    country_code: null,
    notes: `Imported from storefront inventory · ${item.kind}${item.subtitle ? ` · ${item.subtitle}` : ""}`,
    fee: positive(item.base_rate_kes),
    existing: null,
    certain: false,
  };
}

/** A line from a pasted list, with what Discovery knows about that person when it knows them. */
export function candidateFromListed(listed: ListedCreator, known: Candidate | null): Candidate {
  const fromList: CandidateAccount[] = listed.accounts.map((a) => ({ ...a, engagement: null, on: true }));
  const { accounts } = mergeAccounts(fromList, known?.accounts.filter((a) => a.on) ?? []);
  return {
    key: `list:${listed.line}`,
    full_name: listed.name ?? known?.full_name ?? listed.accounts[0]?.handle ?? listed.line,
    accounts: accounts.map((a) => ({ ...a, on: true })),
    email: listed.email ?? known?.email ?? null,
    phone: listed.phone ?? known?.phone ?? null,
    avatar_url: known?.avatar_url ?? null,
    niche: known?.niche ?? null,
    region: known?.region ?? null,
    city: known?.city ?? null,
    country_code: known?.country_code ?? null,
    problem: listed.problem,
    existing: null,
    certain: false,
  };
}

/** Works out who this already is on the roster. A one-word name is too weak to assume, so it only raises the question. */
export function resolveCandidate(candidate: Candidate, rows: any[], agencyId?: string | null): Candidate {
  if (candidate.existing && candidate.certain) return candidate;
  const match = matchRoster(candidate.accounts.filter((a) => a.on), candidate.full_name, rows, agencyId);
  if (match.exact) return { ...candidate, existing: match.exact, certain: true, nameMatch: null };
  const same = match.sameName[0] ?? null;
  const manyWords = personNameKey(candidate.full_name).includes(" ");
  return { ...candidate, existing: same && manyWords ? same : null, certain: false, nameMatch: same };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What to save for a candidate on `existing`, or null when the roster already has it all. */
export function planRosterWrite(candidate: Candidate, existing: any | null): { id: string | null; values: Record<string, unknown> } | null {
  const ticked: CreatorAccount[] = candidate.accounts.filter((a) => a.on).map(({ on: _on, ...a }) => a);

  if (!existing) {
    return {
      id: null,
      values: {
        full_name: candidate.full_name,
        ...accountsToColumns(ticked),
        email: candidate.email,
        phone_mpesa: candidate.phone,
        avatar_url: candidate.avatar_url,
        niche: candidate.niche,
        region: candidate.region,
        city: candidate.city,
        country_code: candidate.country_code,
        // Carried over rather than confirmed by a person, so it stays open to checking.
        country_source: candidate.country_code ? "imported" : null,
        ...(candidate.notes ? { notes: candidate.notes } : {}),
      },
    };
  }

  const current = accountsOf(existing);
  const { accounts: merged } = mergeAccounts(current, ticked);
  const values: Record<string, unknown> = {};
  const columns = accountsToColumns(merged);
  if (!sameJson(columns, accountsToColumns(current))) {
    Object.assign(values, columns, {
      // A row with no handle yet can still hold numbers worth keeping.
      follower_count: columns.follower_count || existing.follower_count || 0,
      engagement_rate: columns.engagement_rate || existing.engagement_rate || 0,
    });
  }
  const fill = (column: string, value: unknown) => {
    if (value && !existing[column]) values[column] = value;
  };
  fill("email", candidate.email);
  fill("phone_mpesa", candidate.phone);
  fill("avatar_url", candidate.avatar_url);
  fill("niche", candidate.niche);
  fill("city", candidate.city);
  fill("country_code", candidate.country_code);
  if (values.country_code) values.country_source = "imported";
  return Object.keys(values).length ? { id: existing.id, values } : null;
}

/** A first guess at what to ask of these creators: a video on the platforms they are on. */
export function defaultBreakdown(candidates: Candidate[]) {
  const platforms = [...new Set(candidates.flatMap((c) => c.accounts.filter((a) => a.on).map((a) => a.platform)))]
    .filter((p) => TRACKED_PLATFORMS.includes(p));
  return { items: [{ type: "video", count: 1, platforms: platforms.length ? platforms : ["tiktok", "instagram", "facebook"] }] };
}
