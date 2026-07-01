
## Goals

Rework the client report so nothing is empty, top performer/top posts show real depth, and the layout reads cleanly. Apply the same upgrade to the emailed report and the in-tool Overview tab.

## 1. Public report link (`src/pages/PublicReport.tsx`)

**Diagnose the "empty" sections first**
- Share of voice, Creators, Learnings, and Posting cadence appear empty for Royco Q2 Main because of gated conditions or minor data joins, not missing rows (DB confirms 14 creators, 42 posts, learnings text saved).
- Widen the render conditions and fall back to `created_at` when `posted_at` is missing so the cadence heatmap doesn't blank.

**Top performer → Top 3 (full metrics)**
- Replace single Top performer card with a 3-column ranked card. For each: name, handle, platform mix, posts count, views, likes, comments, shares, saves, ER%, and reach efficiency vs their follower count.

**Top posts (already 3 picks) → richer stats**
- Under each Most viewed / Highest engagement / Strongest intent card, add a compact stat strip: Views · Likes · Comments · Shares · Saves · ER% (instead of just one headline stat).

**Share of voice**
- Loosen the `byCreator.size > 1` guard, always render when there is at least one creator with views, and label the section clearly when there's a single dominant creator.

**Learnings & recommendations**
- Move the block up above Creators/Posts so it isn't buried, and make sure it renders whenever `campaign.learnings` has any text (trimmed).

**Creators + Posts layout**
- Convert the bottom "Roster + Posts" grid: creators stay as a compact card, Posts becomes a responsive grid (2 columns on md, 3 on lg) with thumbnail + metric strip per card, replacing the long single column.

## 2. Emailed report

`supabase/functions/_shared/transactional-email-templates/campaign-weekly-report.tsx`:
- Expand `top_creators` rows from 5 to top 3 with fuller metric block (posts, views, engagement, ER%, reach eff).
- Expand `top_posts` rows: currently views/likes/comments/shares. Add saves + ER%.
- Add a compact "Share of voice" list (top 5 creators by % of reach) and a "Standout content" trio mirroring the link picks (Most viewed / Highest engagement / Strongest intent) with per-post metric strip.
- Keep it text-heavy and email-safe (no external CSS, inline styles only).

`supabase/functions/send-campaign-report/index.ts`:
- Build the new payload fields: `top_creators` (top 3 with ER%, reach eff), `top_posts` (top 5 with saves+ER%), `standout_posts` (three picks), `share_of_voice` list.
- Include cumulative learnings if present.

## 3. In-tool Overview tab (`src/pages/app/CampaignDetail.tsx`)

- Mirror the report upgrades: Top performer card → Top 3 mini-cards; Top posts strip → 6-metric strip.
- Fix cadence heatmap to fall back to `created_at`.
- Bump the "Share of voice" and Learnings blocks so they behave the same way as the public report.
- No layout tear-down — same section order, richer cards.

## Out of scope

- No backend schema changes; grants and RLS already allow the public read paths (verified via anon fetch).
- No changes to metric collection.

Proceed?
