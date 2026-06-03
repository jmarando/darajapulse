## What I found

- The database is not empty: this contest currently has **271 rows** and about **263 distinct contestants**.
- Only **143 rows have post URLs**, and only **99 approved/winner rows have post URLs**.
- The app is showing a small number because the current “Contestants” cards only show the **top 12 grouped contestants in the active round**, and the active round is hardcoded to **round 1**.
- The report totals currently count only contestants with posts/metrics, so registered contestants without validated posts can disappear from summary counts.
- “Nje Rey” exists in the database as `nje.rey` with TikTok metrics. Gordon Muiruri and Helvin Omondi are present, but their winner rows have zero metrics because they were imported/marked as winners without a metric-bearing post attached to those exact winner rows.

## Root cause

The system is mixing three things in one table:

1. **Contestant roster**: who entered the contest.
2. **Submitted/found posts**: which posts belong to each contestant.
3. **Metrics snapshots**: the latest views/likes/comments/shares for each post.

Because all three are being stored directly in `contest_entries`, syncing can create duplicate rows, winner rows can become separated from their metric rows, and the UI/report can count one version while the table counts another.

## Proposed “works once and for all” solution

### 1. Make the contestant roster the source of truth
Create a dedicated table for contest contestants, separate from posts.

Each contestant record will store:
- contest
- full name
- phone/email if available
- Instagram/TikTok/Facebook handles
- registration/source ID
- status: active, invalid, winner, disqualified
- placement/prize details if they win

This means the contest can always show **250+ contestants**, even if some do not yet have posts or metrics.

### 2. Store posts separately and link them to contestants
Create a separate `contest_posts` table.

Each post will store:
- contestant ID
- platform
- canonical post URL
- caption
- posted date
- source: manual, CSV, hashtag discovery, handle scan, API
- validation status

This prevents duplicate contestant rows just because one person has multiple TikTok/IG/Facebook posts.

### 3. Store metric snapshots separately
Create a separate `contest_post_metrics` table.

Each refresh will store a snapshot:
- post ID
- views, likes, comments, shares, saves if available
- provider used
- captured time
- error if the refresh failed

The leaderboard will use the latest successful metric snapshot per post. This gives us an audit trail instead of overwriting numbers blindly.

### 4. Add a normalized leaderboard view
Create a read-only database view or function that returns one row per contestant with:
- contestant info
- all linked posts
- latest metrics per post
- summed score
- post count
- missing-data flags
- winner placement/prize if applicable

The admin dashboard, public report, CSV export, and future reports will all use this same source so numbers match everywhere.

### 5. Migrate existing data safely
Backfill from current `contest_entries` into the new structure:
- group rows by registration ID, email, phone, handle, and full name
- preserve the 263-ish contestant roster
- attach known posts to the right contestant
- preserve current winner statuses and placement metadata
- mark rows with invalid handles/manual-only Facebook as needing review

No current data should be deleted during migration.

### 6. Fix the current UI/report behavior
Update the admin contest page and public report to:
- show **all contestants**, not just the top 12 cards
- show clear counts: registered contestants, contestants with posts, contestants with verified metrics, missing metrics
- use the same leaderboard data source for big boxes and tables
- show “Needs review” instead of silently hiding rows with no metrics
- ensure winners use their contestant’s linked metrics instead of zero-value winner rows

### 7. Make syncing reliable
Change sync flow to be roster-first:

```text
CSV/feed/manual registration
  -> upsert contestant
  -> normalize handles
  -> discover or attach posts
  -> refresh post metrics
  -> leaderboard view calculates totals
```

Providers like Ensemble/Apify/Meta become enrichment sources, not the source of truth. If a provider hits quota, contestants still remain visible and flagged as “metrics pending”.

## Implementation steps

1. Add new database tables and access rules for contestants, posts, and metric snapshots.
2. Add a database view/function for the canonical contest leaderboard.
3. Backfill the current contest data into the new tables.
4. Update sync edge functions to write to the new tables.
5. Update admin contest UI to read from the canonical leaderboard and show integrity counts.
6. Update public report and export/report generation to use the same canonical leaderboard.
7. Add a “data quality” panel showing missing posts, invalid handles, provider quota failures, and rows needing manual review.

## Expected result

After this, the contest should consistently show the full contestant roster, with no unexplained drop to 13 rows, and the admin page, public report, and exports should all match because they will read from the same normalized leaderboard source.