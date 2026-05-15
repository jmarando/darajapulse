## Goal

For the **Taste Paradise Royco** hashtag contest, replace today's manual entry flow with a two-stage pipeline:

1. **Ingest contestants** from the external registration tool (`roycoparadiseadmin.netlify.app`) into Daraja Pulse on a schedule + on-demand.
2. **Auto-discover their entry posts** by scraping each contestant's IG/TikTok profile via Apify and keeping posts whose caption contains the contest hashtag.

Then surface everything in the Hashtag Contest tab as **Contestants**, with their per-platform stats and a combined leaderboard score across all platforms.

---

## What you'll see in the UI

- Hashtag Contest tab gets a new **Contestants** sub-view (the word "Creator" becomes "Contestant" only inside this section, per your call).
- Each contestant card shows: name, avatar (from IG/TikTok), email/phone (collapsed), and a row per discovered post (platform icon, thumbnail, views/likes/comments/shares, link).
- A single **Total Score** per contestant = sum of weighted scores across all their posts on all platforms.
- A **"Sync contestants"** button (manual refresh) and a **"Find posts"** button per contestant (re-runs Apify just for them).
- A small "Last synced X min ago" indicator and a banner if the feed URL secret hasn't been set yet.

---

## Pipeline

```text
 Netlify form ──▶ contestant-feed JSON ──▶ [contestants-sync edge fn] ──▶ contest_entries (1 placeholder row per handle, status='registered')
                                                                       │
 Cron: every 6h ───────────────────────────────────────────────────────┘
                                                                       │
                                          ┌────────────────────────────┘
                                          ▼
                                 [contest-discover-posts edge fn]
                                  ├─ for each registered handle:
                                  │    Apify IG profile scraper  ─▶ filter caption ~ #TasteParadise
                                  │    Apify TikTok profile scraper ─▶ filter caption ~ #TasteParadise
                                  └─ upsert one contest_entries row per matched post (status='approved')
                                          │
                                          ▼
                                 [contest-poll] (existing) recomputes scores
```

---

## Decisions baked in (you skipped the URL question, so I'm making these reasonable)

- **Feed URL** stored as a runtime secret `CONTESTANT_FEED_URL` (+ optional `CONTESTANT_FEED_AUTH_HEADER`). I'll ship the pipeline; you paste the URL when ready and the sync starts working immediately. The Netlify dashboard clearly has an exporter, so this URL exists — easiest is: open the page → DevTools → Network → click the refresh icon → copy the request URL.
- **Hashtag matching**: case-insensitive `#tasteparadise` (plus any extras in `contests.hashtag` / `campaigns.hashtags_extra`).
- **Apify actors**: `apify/instagram-profile-scraper` and `clockworks/tiktok-scraper` (already what `APIFY_API_TOKEN` is provisioned for). Pull last 30 posts per handle.
- **Cadence**: pg_cron every 6h calls both `contestants-sync` then `contest-discover-posts`. Both are idempotent (upsert by `post_url`).
- **Source of truth**: each Apify-discovered post becomes its own `contest_entries` row with `source='apify'`. The original "registration" gets `source='registration'` and acts as the contestant record.

---

## Database changes

Single migration:

- `contest_entries`:
  - add `external_registration_id text` (id from the Netlify feed, for upsert)
  - add `full_name text`, `phone text`, `address text`, `lga text` (registration data)
  - add `instagram_handle text`, `tiktok_handle text`, `facebook_handle text`
  - add `metadata jsonb default '{}'` (raw payloads for debugging)
  - widen `status` allowed values to include `'registered'` (no posts found yet)
  - make `post_url` nullable (registration rows have no URL until Apify finds posts)
  - unique index on `(contest_id, post_url) where post_url is not null`
  - unique index on `(contest_id, external_registration_id) where external_registration_id is not null`
- New table `contestant_sync_runs` (run history: started_at, finished_at, source, fetched, upserted, errors jsonb) — powers the "Last synced" indicator.

---

## Edge functions

1. **`contestants-sync`** — fetch `CONTESTANT_FEED_URL`, normalize each registration, upsert into `contest_entries` keyed on `external_registration_id`. Writes a row to `contestant_sync_runs`.
2. **`contest-discover-posts`** — for each contestant in a contest, call Apify per platform, filter captions for the hashtag, upsert one row per matching post with views/likes/comments/shares and `posted_at`. Reuses the existing scoring formula.
3. Schedule both via `pg_cron` (6h interval) using `supabase--insert` (per project rules — don't put scheduled job SQL in migrations).

---

## Frontend changes (`src/pages/app/ContestsSection.tsx` + small bits)

- Rename label "Creator" → "Contestant" inside the Contests tab only.
- New Contestants sub-tab: groups `contest_entries` by contestant (handle/external id) and renders nested post rows.
- Header actions: **Sync contestants now**, **Discover posts now**, "Last synced" stamp.
- Keep the existing manual add/edit flow as a fallback.
- Public report (`PublicReport.tsx`) and PPTX export (`exportReport.ts`) re-use the same grouping so the client sees Contestants + their cross-platform totals.

---

## Out of scope (call out, not building)

- Facebook scraping (no reliable Apify actor for personal profiles; we'll store the handle but not fetch metrics).
- Reach / saves on Instagram (still Graph-API-only — KPI tiles already show "—" with footnote).
- Per-contestant deduplication when the same person registers twice with different emails — we dedupe on handle within a contest, but cross-contest dupes are intentional.

---

## What I need from you after approval

1. The feed URL (and any auth header) → I'll add it as a secret.
2. Confirm the contest's hashtag string is exactly `#TasteParadise` (currently stored on `contests.hashtag`).