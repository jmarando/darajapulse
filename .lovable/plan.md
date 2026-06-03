# Contest data integrity — full plan

## Ensemble unit budget (1500 units / day, resets 00:00 UTC)

| Job | Cost | Frequency |
|---|---|---|
| Per-URL metrics refresh (`tt/post/info?url=` etc.) | 1 unit per known post | Daily, all ~250 known posts → ~250u |
| Hashtag sweep (`tt/hashtag/posts`) | ~10u | Daily, finds brand-new public posts |
| Per-handle discovery (`tt/user/posts`, `instagram/user/info` + `user/posts`) | ~2–4u per contestant | Capped at 80 contestants/run with a 22h cooldown — rotates through the backlog over ~3 days |

Once a contestant's `post_url` is stored, future runs **skip discovery entirely** for that row and just call the cheap 1-unit per-URL refresh. `metadata.discovery.found_nothing = true` puts a row on cooldown so we don't pound dead handles every day.



## A. What's actually broken (audited)

Live counts on contest `531899fc…` (271 rows):

| Symptom | Count | Cause |
|---|---|---|
| Winners with 0 pts (Njagi, Helvin) | 2 | Winner row has no `post_url` |
| Winner with 0 pts (Gordon) | 1 | `vt.tiktok.com` short URL never resolved |
| `vt.tiktok.com` short URLs | 28 | No HEAD-resolve step on ingest |
| TikTok handles with no working post | 119 | Hashtag-discovery missed them, no per-handle fallback in refresh |
| Instagram handles with no working post | 123 | Same + only 1 IG business account linked |
| Facebook handles with no working post | 109 / 122 | Only 1 FB page linked, no Apify fallback |

## B. Per-platform fetch audit

**TikTok** — Ensemble hashtag works but capped; per-handle Ensemble works but only runs on manual click; metrics call dies on short URLs. Fix: HEAD-resolve, run per-handle nightly, add free TikTok oEmbed sanity check.

**Instagram** — Meta Graph needs a linked IG business account (we have 1); Ensemble per-handle works; reels without shortcodes silently fail. Fix: per-handle nightly fallback, add Apify IG as second fallback, broaden `/reel|/reels|/tv` → `/p/<code>/` canonicalizer.

**Facebook** — No public hashtag API. Graph metrics only work for owned pages (1/122). Fix: wire Apify FB Post Scraper as fallback in `contest-refresh-metrics-meta`, keep amber "manual entry" badge for handles where Apify also yields nothing.

## C. Handle-only contestants → discovered posts

For every row missing a URL or with 0 metrics, the refresh job runs in order:
1. Canonicalize / HEAD-resolve any URL already on the row.
2. Per-handle Ensemble (TikTok / IG) or Apify (FB) → filter by contest hashtag → pick top by views/likes → attach.
3. Write discovered URL to `post_url`, append previously-known posts to `cross_posts` so nothing is lost.
4. Log each attempt + outcome to `contestant_sync_runs.errors` so the UI can show "tried tt/user/posts → 0 hashtag matches" instead of just zeros.

## D. Winners

Group by handle (case-insensitive, strip `@` and URL prefix) across all four handle columns + `handle`. A winner row inherits metrics from any sibling row sharing a handle — fixes Helvin immediately (sibling `helvin_lifestyle` already has 7,373 pts). After every refresh, any winner still at 0 metrics auto-triggers `contest-fetch-handle-posts` for its handles.

## E. Data-integrity & merge model (new)

The risk: 4 sources (Ensemble, Apify, Meta Graph, Manual) can write to the same `contest_entries` row; today, whichever runs last wins. We need deterministic merging.

### E.1 Source-of-truth rules per field

| Field | Trust order (highest → lowest) | Reason |
|---|---|---|
| `post_url` (canonical) | Manual > oEmbed-resolved > Ensemble > Apify | Manual is human-verified; resolvers are deterministic |
| `views` / `likes` / `comments` / `shares` | **Take the MAX across sources for the same `post_url`**, never the latest | Counters only ever grow; any source that returns a lower number is stale or an undercount |
| `caption` / `thumbnail_url` / `posted_at` | First non-empty wins, never overwritten unless newer source is also non-empty AND row is "manual-locked: false" | Avoids flapping |
| `status` (`approved` / `rejected` / `winner`) | **Manual-only** — never written by any fetcher | Editorial decision |
| `placement_rank` / `prize` | **Manual-only** | Editorial |
| `score` | **Computed**, never written by fetchers | Derived from the merged metrics + formula |

### E.2 Storage shape (no schema migration)

Use the existing `metadata jsonb` column as a per-source ledger so no source overwrites another:

```json
{
  "sources": {
    "ensemble":  { "fetched_at": "...", "views": 1200, "likes": 80, "comments": 4, "shares": 1, "post_url": "..." },
    "apify":     { "fetched_at": "...", "views": 1184, "likes": 80, "comments": 4, "shares": 1 },
    "meta":      { "fetched_at": "...", "views": null, "likes": 79 },
    "manual":    { "edited_at": "...",  "views": 1500, "edited_by": "user_id" }
  },
  "merge": { "computed_at": "...", "winning_source_per_field": {...} },
  "fetch_attempts": [
    { "at": "...", "source": "ensemble", "endpoint": "tt/post/info", "ok": false, "error": "invalid_short_url" }
  ],
  "locks": { "post_url": false, "metrics": false }
}
```

The top-level columns (`views`, `likes`, `comments`, `shares`, `post_url`, `caption`, `thumbnail_url`, `posted_at`) stay as the **computed merged values**, so all existing UI/report code keeps working unchanged.

### E.3 Merge function

A single `mergeEntry(row, incoming, source)` helper, used by every edge function before writing:

1. Write `metadata.sources[source] = incoming` (untouched raw payload from that source).
2. Append `{ at, source, endpoint, ok, error? }` to `metadata.fetch_attempts` (cap at last 20).
3. Recompute top-level merged columns from `metadata.sources` using the rules in E.1 (MAX for counters, trust order for URL).
4. If `metadata.locks.<field> === true`, skip recomputing that field — manual lock wins forever.
5. Never touch `status`, `placement_rank`, `prize`, `full_name`, contact fields from a fetcher payload.

### E.4 Manual edits

When a user edits a row in the UI, mark `metadata.locks.metrics = true` (and/or `locks.post_url = true`) and stamp `sources.manual`. The next fetcher run still records its findings in `metadata.sources` (good for audit) but does not overwrite the displayed value.

### E.5 Deduping at the contestant level

Today duplicate rows for the same person are independent. Group key (already used in UI):

```text
contest_id + lower(strip(first_non_empty(tiktok_handle, instagram_handle, facebook_handle, handle, full_name_slug)))
```

For the leaderboard total we **SUM across unique `canonical(post_url)`** belonging to that group (a contestant's IG + TikTok + FB add up), but within one `post_url` we take the **single merged metric** (no double counting if 2 sources fetched the same URL).

### E.6 Audit visibility

- A small "Data sources" popover on each card showing which source supplied which field, last fetch time per source, and the last 3 attempts (success/error). Gives you eyes on integrity without opening the DB.

## F. UI restructure (kept from previous turn)

- Drop the "Leaderboard · everyone still in the running" header; single unified table.
- Cards: top 10 only, header `Top 10 (showing 10 of {{total}})`.
- Below: one sortable table of every contestant 1..N including winners (crown badge).
- Per-row "Refresh this contestant" button runs the chain in C for that handle only.

## G. Files touched

- `src/pages/app/ContestsSection.tsx` — top-10 cards, single table, drop subheader, handle-based winner rollup, per-row refresh button, Data-sources popover.
- `supabase/functions/_shared/fetch-metrics.ts` (new) — `resolveShortUrl`, `canonicalize`, `oembedCheck`, `fetchTikTokMetrics`, `fetchInstagramMetrics`, `fetchFacebookMetrics` (with Apify fallback), `discoverPostsByHandle`, **`mergeEntry`**.
- `supabase/functions/contest-refresh-metrics/index.ts` — use shared helper + `mergeEntry`, run per-handle discovery on URL-less/zero rows, auto-rescue winners.
- `supabase/functions/contest-fetch-handle-posts/index.ts` — use shared helper, accept `single_entry_id` for the per-row button.
- `supabase/functions/contest-refresh-metrics-meta/index.ts` — Apify FB fallback, use `mergeEntry`.
- `supabase/functions/contest-refresh-metrics-apify/index.ts` — use `mergeEntry`.
- `supabase/functions/contest-discover-posts/index.ts` — broaden IG canonicalization, use `mergeEntry`, persist `fetch_attempts`.

## H. Out of scope this round

- Schema split into `contest_contestants` / `contest_posts` / `contest_post_metrics` — still the long-term right answer, but this plan delivers the integrity guarantees without that migration risk.
- Building our own FB hashtag crawler — not feasible without owned page tokens.
