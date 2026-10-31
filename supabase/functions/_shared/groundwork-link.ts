// The Groundwork link: what Groundwork sends Pulse, what Pulse keeps, and what it answers. Pure (no
// Deno, no database), so the checks and the shapes are tested in src/test/groundworkLink.test.ts;
// the groundwork-* functions only run the queries. The caps below are Groundwork's own.

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** A request the caller got wrong; the message says which field and never repeats its value. */
class Bad extends Error {}

function check<T>(read: () => T): Checked<T> {
  try {
    return { ok: true, value: read() };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    throw e;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BUDGET = 999_999_999_999;

const realDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return DATE.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const body = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Bad("Send a JSON object.");
  return raw as Record<string, unknown>;
};

/** A line of text that has to be there. */
const required = (r: Record<string, unknown>, field: string, max: number) => {
  const s = typeof r[field] === "string" ? (r[field] as string).trim() : "";
  if (!s) throw new Bad(`${field} is required.`);
  if (s.length > max) throw new Bad(`${field} can be at most ${max} characters.`);
  return s;
};

/** A line of text that may be left out or empty. */
const optional = (r: Record<string, unknown>, field: string, max: number) => {
  const v = r[field];
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new Bad(`${field} must be text.`);
  if (v.trim().length > max) throw new Bad(`${field} can be at most ${max} characters.`);
  return v.trim();
};

/** A list of lines, blanks dropped; at most `n` of them, each at most `max` characters. */
const list = (r: Record<string, unknown>, field: string, n: number, max: number) => {
  const v = r[field];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Bad(`${field} must be a list.`);
  const lines = v
    .map((x) => {
      if (typeof x !== "string") throw new Bad(`${field} can only hold text.`);
      if (x.trim().length > max) throw new Bad(`${field} lines can be at most ${max} characters.`);
      return x.trim();
    })
    .filter(Boolean);
  if (lines.length > n) throw new Bad(`${field} can hold at most ${n} lines.`);
  return lines;
};

const tagged = (field: string, tags: string[]) => {
  if (tags.some((t) => !/^[#@]/.test(t))) throw new Bad(`${field} must start with # or @.`);
  return tags;
};

const uuid = (r: Record<string, unknown>, field: string) => {
  const s = required(r, field, 36);
  if (!UUID.test(s)) throw new Bad(`${field} must be a uuid.`);
  return s;
};

const date = (r: Record<string, unknown>, field: string) => {
  const s = required(r, field, 10);
  if (!realDate(s)) throw new Bad(`${field} must be a date like 2026-11-30.`);
  return s;
};

/** The "Paid for by" line every post and every approach carries. */
const paidFor = (r: Record<string, unknown>) => {
  const s = required(r, "paid_for_by", 160);
  if (s.length < 3) throw new Bad("paid_for_by must be at least 3 characters.");
  return s;
};

/* ------------------------------------------------------------------ groundwork-brief */

export type BriefRequest = {
  groundwork_campaign_id: string;
  client_name: string;
  campaign_name: string;
  objective: string;
  brief: string;
  tone: string;
  hashtag: string;
  hashtags_extra: string[];
  mandatory_mentions: string[];
  dos: string[];
  donts: string[];
  start_date: string;
  end_date: string;
  budget_kes: number;
  paid_for_by: string;
};

/** The brief as Pulse takes it, or the sentence saying which field is wrong. */
export const checkBriefRequest = (raw: unknown): Checked<BriefRequest> =>
  check(() => {
    const r = body(raw);
    const groundwork_campaign_id = uuid(r, "groundwork_campaign_id");
    const client_name = required(r, "client_name", 120);
    const campaign_name = required(r, "campaign_name", 120);
    const objective = required(r, "objective", 600);
    const brief = required(r, "brief", 4000);
    const tone = optional(r, "tone", 200);
    const hashtag = optional(r, "hashtag", 60);
    tagged("hashtag", hashtag ? [hashtag] : []);
    const hashtags_extra = tagged("hashtags_extra", list(r, "hashtags_extra", 9, 60));
    const mandatory_mentions = list(r, "mandatory_mentions", 6, 60);
    const dos = list(r, "dos", 12, 200);
    const donts = list(r, "donts", 12, 200);
    const start_date = date(r, "start_date");
    const end_date = date(r, "end_date");
    if (end_date < start_date) throw new Bad("end_date can't be before start_date.");
    const budget_kes = r["budget_kes"];
    if (typeof budget_kes !== "number" || !Number.isInteger(budget_kes) || budget_kes <= 0 || budget_kes > MAX_BUDGET)
      throw new Bad("budget_kes must be a whole number of shillings above zero.");
    return {
      groundwork_campaign_id,
      client_name,
      campaign_name,
      objective,
      brief,
      tone,
      hashtag,
      hashtags_extra,
      mandatory_mentions,
      dos,
      donts,
      start_date,
      end_date,
      budget_kes,
      paid_for_by: paidFor(r),
    };
  });

/** Two lines every political campaign carries, whatever the brief says. */
export const FIXED_DONT = "Never appeal to or target anyone by tribe or community.";
export const fixedDo = (paidForBy: string) =>
  `Label every post as a paid partnership and carry the line: ${paidForBy.replace(/\.+$/, "")}.`;

/** `line` first, then `lines` without a copy of it (case and spacing ignored). */
const withLine = (line: string, lines: string[]) => {
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return [line, ...lines.filter((l) => key(l) !== key(line))];
};

/** What a brief writes into `campaigns`, the first time and every time after. */
export const campaignColumns = (b: BriefRequest) => ({
  name: b.campaign_name,
  objective: b.objective,
  brief: b.brief,
  tone: b.tone || null,
  hashtag: b.hashtag || null,
  hashtags_extra: b.hashtags_extra,
  mandatory_mentions: b.mandatory_mentions,
  dos: withLine(fixedDo(b.paid_for_by), b.dos),
  donts: withLine(FIXED_DONT, b.donts),
  start_date: b.start_date,
  end_date: b.end_date,
  budget_kes: b.budget_kes,
  political: true,
  paid_for_by: b.paid_for_by,
  require_draft_approval: true,
});

/** The database's slugify, in JS. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** The slug a name gets; a retry (the plain one was taken) ends with the start of the Groundwork campaign's id. */
export const slugFor = (name: string, groundworkCampaignId: string, retry = false) => {
  const base = slugify(name) || "groundwork";
  return retry ? `${base}-${groundworkCampaignId.slice(0, 8)}` : base;
};

/** The client a Groundwork campaign is filed under, in the named agency (set here, never left to a default). */
export const clientColumns = (b: BriefRequest, agencyId: string, retry = false) => ({
  agency_id: agencyId,
  name: b.client_name,
  slug: slugFor(b.client_name, b.groundwork_campaign_id, retry),
});

/** The first brief for a Groundwork campaign: a draft, in the named agency (set here, never left to a default). */
export const newCampaignRow = (
  b: BriefRequest,
  ids: { id: string; agencyId: string; clientId: string },
  retry = false,
) => ({
  id: ids.id,
  agency_id: ids.agencyId,
  client_id: ids.clientId,
  status: "draft" as const,
  slug: slugFor(b.campaign_name, b.groundwork_campaign_id, retry),
  ...campaignColumns(b),
});

/* ------------------------------------------------------------------ groundwork-report */

/** A request that names one Groundwork campaign (the report asks for nothing else). */
export const checkReportRequest = (raw: unknown): Checked<string> =>
  check(() => uuid(body(raw), "groundwork_campaign_id"));

/** Postgres hands numeric columns back as text; Groundwork reads only JSON numbers. */
const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
};

/** An embedded row arrives as an object, or as a one-item list in some client versions. */
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type CreatorRow = {
  id: string;
  full_name: string;
  handle: string | null;
  primary_platform: string | null;
  follower_count: number | string | null;
};
export type RosterRow = { fee_kes: number | string | null; status: string | null; influencers: CreatorRow | CreatorRow[] | null };
export type PostRow = {
  id: string;
  influencer_id: string;
  platform: string | null;
  post_url: string | null;
  posted_at: string | null;
  status: string | null;
};
/** One row of campaign_post_peak_metrics: a post's peak, with no timestamp when it has no snapshot. */
export type PeakRow = {
  post_id: string;
  captured_at: string | null;
  views: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  shares: number | string | null;
  reach: number | string | null;
};
export type PayoutRow = {
  id: string;
  influencer_id: string;
  gross_kes: number | string;
  wht_kes: number | string | null;
  net_kes: number | string | null;
  status: string | null;
  paid_at: string | null;
  mpesa_ref: string | null;
};
export type ProspectRow = { id: string; status: string };

/** What a linked campaign has: its creators, their posts at peak, what they were paid, and who was approached. */
export function shapeReport(rows: {
  campaign: { id: string; status: string | null };
  roster: RosterRow[];
  posts: PostRow[];
  peaks: PeakRow[];
  payouts: PayoutRow[];
  prospects: ProspectRow[];
}) {
  const peaks = new Map(rows.peaks.map((p) => [p.post_id, p]));
  return {
    pulse_campaign_id: rows.campaign.id,
    status: rows.campaign.status,
    creators: rows.roster.flatMap((r) => {
      const c = one(r.influencers);
      return c
        ? [
            {
              id: c.id,
              name: c.full_name,
              handle: c.handle,
              platform: c.primary_platform,
              followers: num(c.follower_count),
              fee_kes: num(r.fee_kes),
              status: r.status,
            },
          ]
        : [];
    }),
    posts: rows.posts.map((p) => {
      const peak = peaks.get(p.id);
      // No snapshot yet means the numbers are missing, not zero. Zero reach means the platform gave none.
      const seen = (v: unknown) => (peak?.captured_at ? num(v) : null);
      const reach = seen(peak?.reach);
      return {
        id: p.id,
        creator_id: p.influencer_id,
        platform: p.platform,
        url: p.post_url,
        posted_at: p.posted_at,
        status: p.status,
        views: seen(peak?.views),
        likes: seen(peak?.likes),
        comments: seen(peak?.comments),
        shares: seen(peak?.shares),
        reach: reach && reach > 0 ? reach : null,
      };
    }),
    payouts: rows.payouts.map((p) => ({
      id: p.id,
      creator_id: p.influencer_id,
      gross_kes: num(p.gross_kes) ?? 0,
      wht_kes: num(p.wht_kes),
      net_kes: num(p.net_kes),
      status: p.status,
      paid_at: p.paid_at,
      mpesa_ref: p.mpesa_ref,
    })),
    prospects: rows.prospects.map((p) => ({ prospect_id: p.id, status: p.status })),
  };
}

/* ------------------------------------------------------------------ groundwork-prospect */

/** Where an approach stands, in the words Groundwork keeps. */
export const PROSPECT_STATUSES = ["approached", "invited", "on_roster", "declined"] as const;

export type ProspectRequest = {
  groundwork_campaign_id: string;
  platform: string;
  handle: string;
  name: string;
  url: string | null;
  followers: number | null;
  invitation: string;
  why: string[];
  paid_for_by: string;
};

/** A voice Groundwork's office has approached, as Pulse takes it. The platform stays plain text (Pulse's own list has no "x"). */
export const checkProspectRequest = (raw: unknown): Checked<ProspectRequest> =>
  check(() => {
    const r = body(raw);
    const groundwork_campaign_id = uuid(r, "groundwork_campaign_id");
    const p = r["prospect"];
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new Bad("prospect is required.");
    const q = p as Record<string, unknown>;
    const platform = required(q, "platform", 20).toLowerCase();
    // One account, one way to write it: no @, no capitals.
    const handle = required(q, "handle", 120).replace(/^@+/, "").toLowerCase();
    if (!handle) throw new Bad("handle is required.");
    if (handle.length > 100) throw new Bad("handle can be at most 100 characters.");
    if (/\s/.test(handle)) throw new Bad("handle can't have spaces in it.");
    const name = optional(q, "name", 120);
    const link = optional(q, "url", 500);
    const sent = q["followers"];
    let followers: number | null = null;
    if (sent !== undefined && sent !== null) {
      if (typeof sent !== "number" || !Number.isInteger(sent) || sent < 0)
        throw new Bad("followers must be a whole number, or left out.");
      followers = sent;
    }
    return {
      groundwork_campaign_id,
      platform,
      handle,
      name,
      url: /^https:\/\//i.test(link) ? link : null,
      followers,
      invitation: optional(r, "invitation", 4000),
      why: list(r, "why", 12, 300),
      paid_for_by: paidFor(r),
    };
  });

/**
 * A voice as it is filed, for an upsert on (campaign, platform, handle), in the named agency and campaign.
 * There is no status in it: a new row gets the table's default, "approached", and a repeat send updates
 * the details but cannot move a status that has already moved.
 */
export const prospectRow = (p: ProspectRequest, ids: { agencyId: string; campaignId: string }) => ({
  agency_id: ids.agencyId,
  campaign_id: ids.campaignId,
  platform: p.platform,
  handle: p.handle,
  name: p.name || null,
  url: p.url,
  followers: p.followers,
  invitation: p.invitation || null,
  why: p.why,
  paid_for_by: p.paid_for_by,
});

/* ------------------------------------------------------------------ the agency */

/** Why the link has no agency to work in, or null when it has one. It never falls back to another agency. */
export const agencyProblem = (
  slug: string | null | undefined,
  agency: { is_active: boolean; is_suspended: boolean } | null,
): string | null => {
  if (!slug?.trim()) return "GROUNDWORK_AGENCY_SLUG is not set in Pulse.";
  if (!agency) return "No agency has the slug in GROUNDWORK_AGENCY_SLUG.";
  if (!agency.is_active) return "The agency in GROUNDWORK_AGENCY_SLUG is not active.";
  if (agency.is_suspended) return "The agency in GROUNDWORK_AGENCY_SLUG is suspended.";
  return null;
};
