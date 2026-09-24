# Cross-posting, Nano roster cleanup, metrics and payments

## Confirmed live state
- Royco KE Q3 Nano has 378 roster entries and exactly 135 signed agreements.
- The 243 unsigned entries have no submitted videos or live posts, so removing their campaign-roster links will not discard campaign work.
- The 135 signed creators include two whose roster status says declined; signed agreement remains the source of truth, so all 135 stay.
- The campaign has 259 live posts. Statistics are scheduled to refresh twice daily, but coverage is uneven: 52 posts refreshed in the last 24 hours and 90 have never returned metrics. TikTok is current; Instagram, Facebook and YouTube need recovery attention.
- The signed contract pays from the best-performing reel using its views/reach tier, with 5% withholding tax.

## Build

### 1. Treat cross-posts as one creative with several publications
- Add a durable creative-group reference so TikTok, Instagram, Facebook and YouTube links for the same video remain separate posts for platform metrics but are visibly grouped as one approved creative.
- Extend creator submission to accept all live links for the same approved video in one flow, auto-detect each platform, reject duplicate URLs/platforms, and attach every link to that approved video.
- Keep one publication per platform for reporting. Count the creative once for deliverable completion, while views and engagement remain attributable per platform.
- Show grouped cross-posts together in campaign content, submissions and reporting so teams can see which platforms are missing.

### 2. Safely clean the Nano roster
- Remove only unsigned campaign-roster entries from Royco KE Q3 Nano.
- Preserve all creator profiles and Discovery records; only campaign membership is cleaned.
- Keep all 135 signed agreements, including the two signed creators currently marked declined.
- Recheck roster, signature, video and post counts immediately after cleanup.

### 3. Make end-month statistics auditable
- Keep ScrapeCreators as the first metrics source and retain existing fallbacks.
- Add a campaign-level refresh status showing last successful update, current/never-synced counts and per-platform coverage.
- Run a controlled refresh for the Nano campaign, retrying missing figures without double-counting cross-posts and reporting unsupported/private links separately.
- Verify the scheduled refresh remains active after the manual end-month pass.

### 4. Add a Payments tab
- Add a campaign Payments tab limited to signed creators.
- Calculate each creator’s provisional gross pay from the single best-performing reel/publication across their grouped cross-posts, using the exact contract tiers:
  - 1,000–4,999: KES 5,000
  - 5,000–9,999: KES 7,000
  - 10,000–19,999: KES 12,000
  - 20,000–29,999: KES 17,000
  - 30,000–49,999: KES 25,000
  - 50,000–69,999: KES 30,000
  - 70,000–99,999: KES 35,000
  - 100,000–199,999: KES 40,000
  - 200,000–299,999: KES 45,000
  - 300,000–499,999: KES 50,000
  - 500,000–599,999: KES 55,000
  - 600,000–699,999: KES 60,000
  - 700,000–799,999: KES 65,000
  - 800,000–899,999: KES 70,000
  - 900,000+: KES 75,000
- Show best post, best views/reach, gross, 5% withholding tax, net, metrics freshness, and payment status.
- Mark calculations as provisional when metrics are missing or stale. Do not create payable records automatically until figures are complete; provide an explicit finalize action to prevent accidental payouts.
- Support CSV export for finance reconciliation.

## Validation
- Test one approved video submitted across multiple platforms and confirm one deliverable, separate platform metrics, and one payment tier.
- Confirm the Nano roster is exactly 135 and every remaining row has a signature.
- Confirm existing posts, drafts, signatures and creator profiles remain intact.
- Verify payment boundary values, withholding calculations, missing-metric warnings and CSV totals.
- Run focused tests, type checks, production build, and desktop/mobile browser checks.
