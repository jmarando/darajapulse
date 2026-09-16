# Fix: skipped posts in the metrics refresh + overloaded profile scraper

Two of the pending Project monitoring findings, addressed together because both are about how we pace work sent to the scraper.

## 1. The scheduled refresh jumps over posts

**What happens now:** each scheduled run rebuilds the list of posts that are "due" for a refresh, then skips ahead by the number of posts the previous run handled. But every post that was refreshed successfully has already left the list, so skipping ahead by the full count jumps past posts that were never touched. With 60 posts per run and 50 successes, the next run starts 50 posts too far along. Those posts wait until the next day, or longer.

**Fix:** advance only by the number of posts that stayed in the queue — the ones that failed and will still be listed as due. Successful posts remove themselves from the list, so no skipping is needed for them. That keeps the original protection against endlessly re-scraping broken links (private or deleted posts), while nothing that can be refreshed is passed over.

Also raise the safety cap on how many times a run may continue itself (currently 12), so a large backlog can be worked through in one scheduled cycle, and report in the response how many posts were skipped versus refreshed.

## 2. Profile stats refresh launches every job at once

**What happens now:** refreshing creator and inventory profile numbers starts one scraping job per profile simultaneously. With hundreds of profiles, the provider rejects most of them ("memory limit exceeded", "over 32 concurrent runs"), so those creators quietly keep old or empty follower numbers.

**Fix:** process profiles a few at a time (small fixed batch size) instead of all at once, in both the creator stats refresh and the inventory refresh. When the provider still replies that it is over its limits, wait briefly and retry that profile a couple of times before giving up, and count those as retried rather than failed. The runs also stop starting new batches near the time limit and report what is left, so nothing is lost.

Note: this does not fix the separate finding about the scraping account being blocked for unpaid invoices — while that block is in place no scraping succeeds regardless of pacing.

## Technical detail

- `supabase/functions/fetch-public-metrics/index.ts`: compute `succeeded` from results; chain with `offset: start + (processed - succeeded)`; raise `MAX_CHAIN`; include `skipped`/`succeeded` in the JSON response.
- `supabase/functions/refresh-influencer-stats/index.ts` and `supabase/functions/inventory-refresh/index.ts`: replace `Promise.all(targets.map(...))` with a bounded-concurrency loop (batch size ~5) plus a wall-clock deadline.
- `supabase/functions/_shared/apify-profile.ts`: on HTTP 402 with `actor-memory-limit-exceeded` / `concurrent-runs-limit-exceeded`, back off (e.g. 3s, 8s) and retry up to twice; leave 403 billing errors failing fast.
- Redeploy the three functions and confirm a manual run returns successes with no concurrency errors in the logs.
