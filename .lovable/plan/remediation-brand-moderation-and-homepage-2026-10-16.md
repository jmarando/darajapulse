# Remediation, brand-connected moderation and homepage

Everything surfaced in the October code review, in priority order, plus two builds: brands connecting their own pages for real moderation, and a homepage with more impact.

Sizes: **S** under a day, **M** a few days, **L** a week or more.

---

## 1. Security fixes — done, needs rollout

Shipped on branch `claude/happy-rubin-3kg3n9` (commit `d9b3a57`).

**What was wrong.** `verify_jwt = true` only proves a request carries *a* project key, and the public anon key in the web app passes it. So most edge functions were callable by anyone:

- `app-email` could send any branded template (invoices, re-sign requests) to any address with the caller's own links, from `notify.darajapulse.com`.
- `fetch-public-metrics` and the contest/stats refreshers could be made to spend ScrapeCreators, EnsembleData and Apify credits on demand. `contestants-sync` accepted registrations straight from the request.
- `send-campaign-report` emailed a campaign's report (with its private link) to any `test_email`.
- `stream-setup` would mint a new video signing key, or repoint the Cloudflare webhook, for anyone — enough to watch every private creator draft.
- `ig-insights-test` returned insights for every connected creator account.
- `resolve-post-thumbnail` let anyone replace a post's thumbnail on client-facing reports.
- `instagram-webhook` had a hard-coded fallback verify token and didn't check Meta's signature. `stream-webhook` trusted the state in unsigned deliveries.
- `enforce_billing_status()` was executable by anyone through the API (it can lift a manual suspension).

**What changed.**

- New `supabase/functions/_shared/auth.ts`: a function accepts a scheduled job (its key from `internal_job_keys` in `x-job-key`), another function (service role key), or a signed-in user with the right role. Campaign/contest-scoped calls also check `agency_staff_on_campaign` / `agency_staff_on_contest`.
- Only the demo-request email stays open (its recipient is fixed). Diagnostics are super-admin only.
- `submit-crossposts` now starts the first metrics pull itself, so the public contest page no longer calls `fetch-public-metrics`.
- Migration `drizzle/migrations/0003_scheduled_jobs_use_job_keys.sql` gives each scheduled function its own key, routes all ten existing cron jobs through `public.invoke_job_function` (same names, schedules and bodies) and revokes public execute on `enforce_billing_status`. Every cron job is now defined in version control.

Checked before shipping: live roles (all 33 staff have an agency; all 5 brand owners also hold a staff role, so nobody is locked out), live cron definitions, Deno type-check of every changed function (no new errors), a dry run of the migration in PGlite (re-runnable, correct keys and call counts, privileges revoked), web typecheck, tests and build.

### Rollout (order matters)

1. ~~**Apply migration 0003 first.**~~ **Done:** applied to production on 17 Oct 2026 at about 00:25 UTC and recorded in `drizzle.__drizzle_migrations`. Every scheduled job then ran through the new path (00:30–05:45 UTC) with the same results as before.
2. ~~**Merge the branch** (PR #1).~~ **Done 17 Oct.** Merging did **not** redeploy the edge functions: at 15:05 UTC `contest-poll` still ran the old code. **Still to do:** ask the Lovable agent to "Deploy all Supabase edge functions as they are in the code. Don't change any code." Until then the old functions stay open, and contest cross-posts get metrics from the scheduled job rather than on submission, because the live contest page no longer requests them itself.
3. ~~Publish the frontend~~ **Done 17 Oct:** the new homepage and contest page are live.

### After rollout — please do

- [ ] **Cloudflare Stream:** list signing keys (`stream-setup` `keys-list`, now super-admin only) and delete any the team didn't create. Confirm the webhook still points at `stream-webhook`. Both were open to anyone until now.
- [ ] **Meta webhook:** set a new `META_WEBHOOK_VERIFY_TOKEN` secret (the old value is in git history) and re-verify the webhook in the Meta dashboard. Deliveries are now checked against `META_APP_SECRET`.
- [ ] **Resend inbound:** confirm `RESEND_WEBHOOK_SECRET` is set, then make `resend-inbound` reject unsigned deliveries (today it accepts them when the secret is missing). **S**
- [ ] Watch `net._http_response` for a day: every scheduled call should return 200.

---

## 2. Remaining security work

| # | Item | Why | Size |
|---|---|---|---|
| 2.1 | Rate-limit or cache the public AI endpoints `discovery-match` and `storefront-match` | Anyone can spend AI credits through them | S–M |
| 2.2 | Restrict brand templates (`royco-*`, `omo-*`, `pakakumi-*`) to staff of the agency that owns those clients; allow-list link domains per template | Staff of any tenant can still send another brand's template | M |
| 2.3 | Scope `refresh-influencer-stats` and `inventory-refresh` to the caller's agency unless super admin | Staff in one agency can refresh every agency's roster | S |
| 2.4 | Serve `render_contract` by brief token instead of campaign-entry id | It takes an id with no caller check (low risk: ids are random UUIDs) | S |
| 2.5 | `submit-crossposts`: check each link's host matches its platform server-side | Posts can currently hold any URL, which other functions then fetch | S |
| 2.6 | Delete `stream-setup` and `ig-insights-test` once no longer needed | Setup and App Review tools shouldn't stay deployed | S |
| 2.7 | Add a recurring check: Supabase security advisor + a short RLS test suite | Catch regressions like the ones above | M |

---

## 3. Correctness

| # | Item | Detail | Size |
|---|---|---|---|
| 3.1 | **Emailed reports disagree with the dashboard** | Dashboard uses each post's peak value (`src/lib/metrics.ts`, `campaign_post_peak_metrics`); `send-campaign-report` and `generate-learnings` use the latest snapshot. Switch both to `campaign_post_peak_metrics`. | S |
| 3.2 | **Pesapal payments may never confirm automatically** | `pesapal-ipn` isn't in `config.toml`, so it defaults to requiring a JWT that Pesapal doesn't send. Live data: zero IPN log rows, zero Pesapal payments. Add `verify_jwt = false` (the handler already re-checks every payment with Pesapal) and test with a sandbox payment. | S |
| 3.3 | **Moderation shows fake data** | `/app/moderation` lists invented comments attributed to Safaricom and Unilever, and `/m/<any token>` presents them as a shared view. Hide or label until section 6 ships. | S |
| 3.4 | **MCP `list_influencers` always fails** | It selects `platform` and `campaign_id`, which don't exist on `influencers` (`primary_platform`; campaigns via `campaign_influencers`). | S |
| 3.5 | **Redirects during render** | `AppShell.tsx` and `PortalShell.tsx` call `navigate()` while rendering; use `<Navigate replace />`. Roles load after sign-in completes, so a tenant subdomain can flash "No access". | S |
| 3.6 | **`contestants-sync` fails on every run** | `CONTESTANT_FEED_URL` isn't set, so the daily job and the contest auto-poll get a 412. Each failure leaves its sync-run row stuck at "running" (112 in the last 30 days). Configure the feed or drop the job, and mark the run failed on early exits. | S |

---

## 4. Performance

| # | Item | Detail | Size |
|---|---|---|---|
| 4.1 | ~~Split the bundle by route~~ **Done 17 Oct** | Pages load on demand (`React.lazy` in `src/App.tsx`). The first script fell from 2.7 MB (789 KB gzipped) to 613 KB (182 KB gzipped). Still to do: load `xlsx` and `pptxgenjs` only when someone exports (`src/lib/reportExports.ts`, `src/lib/exportReport.ts`), which shrinks the report and campaign pages. | S (remaining) |
| 4.2 | Adopt React Query for data loading | It is installed but unused; 189 direct queries live in components with no caching. Start with Campaigns and CampaignDetail. | L (incremental) |

---

## 5. Code health

| # | Item | Size |
|---|---|---|
| 5.1 | Keep one lockfile: `package-lock.json` is stale (`npm ci` fails); Lovable uses `bun.lockb` | S |
| 5.2 | CI on pull requests: `tsc`, `vitest`, `vite build`, and `deno check` for edge functions | S |
| 5.3 | Lint signal: downgrade `no-explicit-any` to a warning so the 34 hook-dependency warnings are visible, then fix those | S |
| 5.4 | Turn on `strictNullChecks` (31 errors today, mostly `useParams()` ids) | S–M |
| 5.5 | Split `CampaignDetail.tsx` (2,584 lines, 48 state variables) into tab components with query hooks | L |
| 5.6 | Shared edge modules: one AI gateway client (7 copies today), one EnsembleData client (4 copies), one supabase-js import style (3 versions in use) | M |
| 5.7 | Fix the pre-existing Deno type errors in `contest-poll`, `fetch-public-metrics`, `refresh-influencer-stats`, `resolve-post-thumbnail` | S |
| 5.8 | Remove the old landing experiments under `/landing/*` once the new homepage ships | S |

---

## 6. Brands connect their own pages: real moderation

### Goal

A brand (or the agency on its behalf) connects the brand's Instagram and Facebook pages once. Comments and @mentions then flow into the Moderation inbox in near real time. Each is triaged by AI and handled — reply, hide, escalate — from Daraja Pulse, with every action audited. Clients can watch, and optionally approve, from the portal.

### What exists today

- OAuth flows for Facebook/Instagram (`facebook-oauth-*`, `instagram-oauth-*`), TikTok, YouTube and X. All connected accounts belong to **creators** (`instagram_accounts.influencer_id`, etc.); there is no brand-level connection.
- `instagram-webhook` now verifies signatures but doesn't process events.
- The Moderation UI design is good, and its categories (praise, question, spam, toxic, neutral) and `ownedByClient` distinction carry over directly.
- The Lovable AI gateway is already used in 7 functions.

### Data model (additive)

- **`brand_social_accounts`**: `client_id`, `agency_id`, `platform`, external ids (`page_id`, `ig_user_id`), `access_token`, `scopes`, `token_expires_at`, `webhook_subscribed_at`, `status`, `connected_by`. Tokens are readable by the service role only, like `internal_job_keys`; consider Supabase Vault.
- **`social_comments`**: one row per comment or mention. Fields: `account_id`, `platform`, `external_id` (unique per platform), media id/permalink/caption, parent id, author handle/id, text, posted time, likes/replies, `source` (webhook | poll | scrape), AI fields (`sentiment`, `intent`, `toxicity`, `language`, `suggested_reply`), workflow fields (`status`: open | replied | hidden | deleted | resolved | escalated; `assigned_to`), and links to `campaign_id` / `post_id` / `influencer_id` when it matches our data.
- **`social_comment_actions`**: audit trail of who did what, when, and the platform's response.
- **`client_reply_guides`**: per-brand FAQs, prices, where-to-buy, tone and escalation rules that ground AI reply suggestions.
- **`moderation_links`**: tokens for the public read-only view, replacing today's `/m/:token`, which accepts anything.

RLS follows the existing helpers (`user_has_client_access`, `agency_staff_on_campaign`), with GRANTs included.

### Flow

1. **Connect.** Clients page → client → "Connected pages". Reuse the Facebook Login flow with the client as the subject, and request `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_comments`.
2. **Subscribe.** Subscribe each page (`/{page-id}/subscribed_apps`, fields `feed`, `mention`) and the app's Instagram fields (`comments`, `mentions`).
3. **Ingest.** `instagram-webhook` and a new Facebook page webhook write to `social_comments`. On connect, backfill 30 days of media and comments. A scheduled poll (job key) catches anything webhooks miss.
4. **Triage.** A classifier function sends batches to the AI gateway with strict JSON output: relevance, sentiment, intent, language (English, Swahili, Sheng) and a suggested reply grounded in the brand's guide. Before clients see sentiment, label 200–300 real comments to measure accuracy, and mark it "AI-estimated".
5. **Act.**
   - Reply, hide or delete through the Graph API, using the brand's token for brand-owned posts.
   - Creator-owned campaign posts stay read-only, plus an "ask the creator" step. If a creator granted `instagram_manage_comments`, their token can be used with consent.
   - Suggestions never post automatically: every reply needs a human click. Per-brand auto-hide rules for obvious spam are optional and audited.
6. **Alert.** Unanswered questions past an SLA, spikes in negative comments, and VIP or press accounts trigger email plus the top-bar bell, which does nothing today.
7. **Client portal.** Clients see their brand's inbox, optionally with approve rights. The tokenized public view replaces `/m/:token`.

### Other platforms (later)

- **YouTube:** Google OAuth, `commentThreads` plus moderation status.
- **TikTok:** business comment management requires TikTok for Business API access; apply early.
- **X:** pay-per-use API for mentions and replies (about $0.005 per post read); enable per brand.

### Prerequisites only you can do

- [ ] **Meta App Review** (advanced access) for the permissions above, and business verification.
- [ ] A test brand page and Instagram business account to develop against.
- [ ] Privacy policy update (brand page data, retention), plus a retention period for comments (suggest 13 months) and deletion when a page disconnects. Kenya's Data Protection Act applies.

### Milestones

| Milestone | Delivers | Size |
|---|---|---|
| M1 Foundation | Brand connections, token storage, webhook routing, backfill, read-only inbox on real data (fake data removed) | L |
| M2 Triage and actions | AI classification and reply suggestions, reply/hide/delete, audit trail, assignment | L |
| M3 Clients and alerts | Portal inbox, tokenized share link, SLA and spike alerts, weekly moderation summary in reports | M |
| M4 More platforms | YouTube, TikTok business, X | L |

---

## 7. Social listening (after moderation M2)

Builds on the same tables, classifier and inbox:

- `listening_topics` (brand and competitor keywords, hashtags, exclusions, monthly credit cap).
- A scheduled collector using ScrapeCreators search: TikTok, YouTube, Threads, Reddit, Facebook video, and Google for news. Instagram and X search are Google-indexed and lag; add the official X API for brands that need real-time.
- Dashboards for volume, sentiment, share of voice and top authors (with "add to Discovery"), plus alerts and a weekly digest.

Expected data cost is roughly $30–50 per brand per month.

---

## 8. Homepage with more impact

`/` (`LandingDashboard`) is rebuilt around a bolder hero, live-feeling product proof, an East African creator-economy story and a single strong call to action into the existing demo request flow. The old landing experiments are retired after (5.8). Tracked as its own change on this branch.

---

## 9. Search and installable app — done 17 Oct

**Search.**
- Every route sets its own title, description, canonical URL and robots tag (`src/lib/seo.ts`). Before this, every page declared the homepage as its canonical.
- Only the homepage, Discovery, storefronts and the legal pages are indexable. The app, sign-in, workspace subdomains and private links are `noindex`, and `robots.txt` keeps crawlers out of them.
- Added `sitemap.xml` and Organization and WebSite structured data.
- Storefronts are titled after the agency, and unknown storefront slugs are `noindex`.
- The hero headline now paints without a fade-in, and the homepage images are WebP.

| Lighthouse | Before | After |
|---|---|---|
| Homepage, mobile | 38 (LCP 8.8 s) | 77 (LCP 3.4 s) |
| Homepage, desktop | 89 (LCP 1.9 s) | 100 (LCP 0.7 s) |
| Discovery, mobile | 40 (LCP 6.2 s) | 70 (LCP 3.6 s) |

**Installable app.**
- `public/manifest.webmanifest` and icons. The installed app opens at `/app`.
- `public/sw.js` always fetches pages fresh online, caches fingerprinted build files, and opens the last good page offline. It registers on darajapulse.com hosts only, never in the Lovable preview.
- An **Install app** button sits in the agency and brand sidebars. On iPhone and iPad it explains Share, then Add to Home Screen.

**Follow-ups**

| # | Item | Detail | Size |
|---|---|---|---|
| 9.1 | Search Console | Verify darajapulse.com in Google Search Console and Bing Webmaster Tools, and submit `https://darajapulse.com/sitemap.xml`. Needs the domain owner. | S |
| 9.2 | Link previews per page | WhatsApp, LinkedIn and X don't run JavaScript, so shared Discovery and storefront links show the homepage card. Prerender those few public pages at build time. | M |
| 9.3 | Sitemap from the database | New storefronts must be added to `public/sitemap.xml` by hand today. Serve the sitemap from the database instead. | S |
| 9.4 | Workspace-branded install | Workspace subdomains install as "Daraja Pulse". A per-workspace name and icon needs a generated manifest; only worth it if white-label matters. | M |
| 9.5 | Discovery main thread | Discovery still blocks the main thread for about 0.8 s on mobile. Profile the creator grid. | S |

---

## 10. Menu and inbox review — 20 Oct

What each menu item does today, from the code and live data:

| Menu item | What's behind it | Live data | Proposal |
|---|---|---|---|
| Overview | Dashboard | — | Keep |
| Campaigns | Core | 15 campaigns | Keep |
| Contests | Core | 3 contests | Keep |
| Briefs | Brief template library | 13 templates, last added 25 Sep | Rename **Brief templates**, move to a **Library** group |
| Content | Content calendar | **0 items, ever** | Remove; drafts in each campaign cover this |
| Approvals | **Placeholder** ("Ships in v0.2") | Real approvals happen inside each campaign: 635 drafts, **12 pending now** | Make real: one queue of pending drafts across campaigns, with a count badge |
| Moderation | **Fake data** (3.3) | — | **Kept in the menu**: brands' pages are being wired up (section 6) |
| Inbox | Email replies to `royco@reply.darajapulse.com` | 137 threads, **232 unread, 0 replies sent from it** | Keep; make it the unified inbox (below) |
| RSVPs | Event RSVPs | 98 RSVPs, one campaign, last 12 Sep | Move into that campaign as a tab; remove from the menu |
| Reports | Core | — | Keep |
| Clients, Influencers, Discovery | Roster | 9 clients, 542 influencers | Keep; rename Influencers to **Creators** to match Discovery |
| Storefront | Media-house storefront | 101 items, 0 bookings | Show only for media-house workspaces |

**Done 20 Oct** (agreed, except Moderation stays). Menu: **Overview · Approvals · Inbox · Moderation**, then **Campaigns · Contests · Reports**, then **Creators · Discovery · Clients**, then **Library: Brief templates** and Storefront (media-house workspaces and super admins; Mediamax is still typed as an agency). Approvals and Inbox show counts. `/app/content` redirects to Approvals; `/app/rsvps` still works and each event campaign has an RSVPs tab. Team and Super Admin are unchanged.

### Unified inbox

Today the inbox is email only, from one mailbox, and nobody answers from it: creators' replies to Royco emails pile up unread.

1. ~~**Make the email inbox work.**~~ **Done 20 Oct:** unread count in the menu; Open, Mine, Unassigned and Done views; a mailbox filter; assign to a teammate (replying assigns you); mark done (new mail reopens); and the creator's campaigns and draft statuses beside each conversation. Threads carry no campaign today (`campaign_id` is never set by `resend-inbound`), so there is no campaign filter yet.
2. **Pull creator conversations in (M):** draft feedback threads ("changes requested" on 69 drafts) and brief questions appear as conversations next to email.
3. **Social comments and DMs (after section 6 M1):** once brands connect their Facebook/Instagram pages, comments and DMs land in the same inbox. That pipe is also what social listening (section 7) builds on, so neither ships before Meta App Review.
