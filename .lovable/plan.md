# Refresh campaign figures with the new ScrapeCreators credits

Use the 100 free ScrapeCreators credits to fill in missing view counts on currently running campaigns, while the main scraping account stays blocked. Discovery duplicates and broken profile links are parked until there are more credits.

Each post checked costs roughly one credit, so this is one careful targeted pass, not a background job.

## Where the gaps are right now

Posts with no view count recorded:

| Campaign | Posts missing views |
| --- | --- |
| Royco KE Q3 Nano | 61 |
| Pakakumi Aug–Oct | 35 |
| Phase 1 | 19 |
| OMO Mother's Day | 5 |
| Royco KE Q3 Main | 1 |

121 gaps against 100 credits, so it has to be targeted.

## How it will work

1. You save the ScrapeCreators key in the secure form (I'll open it once you approve).
2. It becomes a fallback source for post figures — used only when the current sources return nothing, and never on the twice-daily automatic schedule.
3. A hard ceiling is enforced in code: a running count of calls, a per-run cap, and a total cap (default 90, leaving 10 spare). When the cap is hit the run stops and says so instead of quietly spending the rest.
4. A **Refresh missing figures** button on the campaign page runs it for that campaign's zero-view posts only. It shows how many credits the run will use before starting, and reports credits used and figures recovered afterwards.
5. Suggested first pass: Royco KE Q3 Nano (61), then OMO and Royco KE Q3 Main (6) — about 67 credits, keeping a reserve. Pakakumi and Phase 1 wait.

## Technical outline

- New secret `SCRAPECREATORS_API_KEY`; new `supabase/functions/_shared/scrapecreators.ts` with per-platform post lookups, mapped into the existing metric shape.
- `fetch-public-metrics/index.ts`: added as a last-resort provider behind an explicit `use_scrapecreators: true` request flag (off for scheduled runs), accepting `max_credits` and returning `credits_used`.
- Credit accounting persisted in a small `scraper_credit_log` table (provider, credits, run context, timestamp) so the remaining balance survives across runs; RLS limited to agency staff, GRANTs included.
- Campaign detail gains the manual action, wired through the existing metrics-refresh invoke path.
- No change to the current provider ordering for anything else; the Apify account stays suspended until its invoices are settled.

## Out of scope

- Discovery duplicate merging and broken profile links (deferred at your request).
- Any automatic or scheduled use of the new credits.
