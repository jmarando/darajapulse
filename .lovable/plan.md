# Contests as a top-level section + Taste Paradise creator hide

## 1. Taste Paradise — hide all creator-related UI on the public report

In `src/pages/PublicReport.tsx`, gate every creator-facing element behind a check for `campaign.id === "67f4ba28-2a11-484c-8f6e-687ac422f5e3"` (campaign already has `HIDE_ROSTER_CAMPAIGN_IDS` pattern — extend it to a single `hideCreators` flag and apply consistently):

- Header chip "N creators" (already done in this turn).
- "Best value creators" section (around L772).
- "Creators" column / values in the per-platform breakdown table (around L464 — drop column entirely when hideCreators).
- Roster panel (already gated via `HIDE_ROSTER_CAMPAIGN_IDS`, keep).
- Any "creator" wording in the velocity/share cards (audit pass).

No data changes; purely presentational.

## 2. Make Contests a top-level section

### Nav

In `src/components/AppShell.tsx`, add a new nav item **Contests** with `Trophy` icon, placed between **Campaigns** and **Briefs**. Route: `/app/contests`.

### Routes (in `src/App.tsx`)

- `GET /app/contests` → new `ContestsList.tsx`
- `GET /app/contests/:id` → new `ContestDetail.tsx`
- `GET /r/contest/:token` → new `PublicContestReport.tsx`

### New pages

**`src/pages/app/ContestsList.tsx`**
- Lists all contests across all campaigns.
- Columns/cards: name, hashtag, platforms, optional campaign+client badge, start/end, entries count, top score, status (active/ended).
- "New contest" dialog — campaign is now **optional** (Select with "Standalone (no campaign)" as the first option).

**`src/pages/app/ContestDetail.tsx`**
- Lift the existing per-contest UI out of `ContestsSection.tsx`: header, leaderboard, entries CRUD, edit dialog, sync/discover actions.
- Tabs: Overview, Leaderboard, Entries, Settings, Reports (schedules + public link toggle).
- Public report link: copy/open `/r/contest/:submission_token` (re-use existing `submission_token`).

**`src/pages/PublicContestReport.tsx`**
- Public route, no auth. Fetches contest via existing `get_contest_by_token` RPC (extend below) + approved/winner entries via existing public RLS.
- Sections: hero (contest name, brand, hashtag, prize, dates), KPI band (entries, contestants, views, total engagement), leaderboard table, winners highlight, platform breakdown. **No influencer/creator roster.**

### Remove Contests tab from campaign detail

In `src/pages/app/CampaignDetail.tsx`, drop the Contests tab/section. Replace with a small "Linked contests" card that lists contest names and links to `/app/contests/:id`. Keep `ContestsSection.tsx` only if still referenced; otherwise delete after migration.

## 3. Data model

Single migration:

- `ALTER TABLE public.contests ALTER COLUMN campaign_id DROP NOT NULL;` — campaign becomes optional.
- Add `client_id uuid` nullable to `contests` so standalone contests can still attach to a client for branding on the public report.
- Update `get_contest_by_token` RPC to LEFT JOIN campaign and resolve client from either `contests.client_id` or `campaigns.client_id`.
- Add a public RLS policy on `contests`/`contest_entries` keyed on `submission_token` so the public report works without `report_links` (mirror existing token-based read for `contests`; extend `contest_entries` similarly).

Existing contests keep their `campaign_id` — no data migration needed.

## 4. Per-contest email reports

Reuse existing infra:

- `report_schedules` already has `contest_id` — add UI in ContestDetail → Reports tab to manage daily-summary and draw-closed schedules per contest (mirror EmailReportsSection but scoped to a contest).
- `report_recipients` keyed by `campaign_id` today. Add nullable `contest_id` and allow recipients scoped to a contest only. Update `run-report-schedules` and `send-contest-*` templates' recipient lookup to union campaign + contest scoped recipients.
- Templates `contest-daily-summary` and `contest-draw-closed` already exist — wire them to work when no campaign is attached (fallback header to contest name/client only).

## 5. Files touched

New:
- `src/pages/app/ContestsList.tsx`
- `src/pages/app/ContestDetail.tsx`
- `src/pages/PublicContestReport.tsx`

Modified:
- `src/App.tsx` (routes)
- `src/components/AppShell.tsx` (nav)
- `src/pages/app/CampaignDetail.tsx` (drop Contests tab, add Linked contests card)
- `src/pages/app/ContestsSection.tsx` (extract reusable pieces or deprecate)
- `src/pages/PublicReport.tsx` (full creator hide for Taste Paradise)
- `supabase/functions/run-report-schedules/index.ts` (contest-scoped recipients)
- Email template recipient lookup as needed.

Migration:
- `contests.campaign_id` nullable, add `contests.client_id`, extend `get_contest_by_token`, add public-token RLS for entries, add `report_recipients.contest_id`.

## 6. Out of scope (call out for later if wanted)

- Moving contest sync cron away from per-campaign assumptions (already keyed by `contest.id`, should just work).
- Renaming `submission_token` → `public_token` (cosmetic).
- Backfilling `contests.client_id` from `campaigns.client_id` for existing contests — easy follow-up insert.
