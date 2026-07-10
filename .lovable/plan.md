## Scope

1. New `shows` entity (separate table + Discovery tab)
2. Storefront (`/s/:agencySlug`) filters + demographic display
3. Demographics: prefer real (OAuth) with AI-estimated fallback (badged)
4. AI fetch round: Mediamax Group talent + shows + broader Kenya creators

## 1. Database

**Migration — new tables + fields:**

- `public.shows` — new table for TV/radio/digital shows
  - fields: `id`, `agency_id` (nullable — station owner if known), `name`, `slug`, `kind` (tv | radio | podcast | digital), `station` (e.g. "K24", "Milele FM"), `host_names` (text[]), `host_creator_ids` (uuid[] → discovery_creators), `airtime` (e.g. "Weekdays 8–10pm"), `days_on_air` (text[]), `platforms` (text[]), `handles` (jsonb — `{instagram, tiktok, youtube, facebook, x, website}`), `niche` (text[]), `region`, `city`, `logo_url`, `description`, `reach_estimate` (bigint), `demographics` (jsonb), `ai_confidence`, `source`, `notes`, timestamps
  - RLS: agency staff + super_admin can read/write within their agency; readable to all authenticated (for cross-agency discovery). Public read via a security-definer RPC for storefront when linked.
- `public.show_contacts` — mirror of `discovery_contacts` for shows (`show_id`, `kind`, `value`, `label`, `is_public`)

**Migration — extend existing tables:**

- `discovery_creators`: add `audience_demo jsonb` (age bands, gender split, top cities, top countries), `demo_source` text ('oauth'|'ai_estimated'|'manual'), `works_for` text[] (station/group affiliations, e.g. `{Mediamax}`), `shows` text[] (associated show names)
- `inventory_items`: `audience_demo` already exists (jsonb). Add `demo_source` text.

## 2. Storefront filters + demographics

Rewrite the top of the `/s/:agencySlug` main section to add a compact filter bar (sticky under header):

- Platform pills (all/instagram/tiktok/youtube/facebook/tv/radio) — driven by items present
- Kind pills (all/Owned/Signed creator/Ad slot/Bundle)
- Category multiselect (from `tags` union across items)
- Follower range: min/max compact inputs
- ER slider: min%
- Demographics: age band checkboxes (18-24, 25-34, 35-44, 45+), gender toggle (any/female-lean/male-lean), top city text match

Filter runs client-side against the already-fetched items. Group grid re-renders per-kind sections filtered.

**Card**: add a "who's watching" strip when `audience_demo` present — three chips (top age band %, gender split, top city) with a tiny "estimated" badge if `demo_source = 'ai_estimated'`.

## 3. Demographics data flow

- If `inventory_items.handle` matches an `instagram_accounts`/`facebook_accounts`/`tiktok_accounts` row, real IG/FB insights data wins (later — no live pull now; we just render whatever is in `audience_demo` with source `oauth`).
- AI seed will fill `audience_demo` + `demo_source='ai_estimated'` for creators without OAuth.
- Storefront simply reads `audience_demo` and `demo_source` from `inventory_items`; a helper backfills from the linked `discovery_creators` row if the inventory item's demo is empty.

## 4. AI fetch

**New edge function `discovery-seed-shows`** (Mediamax-first):

Runs in background (`EdgeRuntime.waitUntil`). Prompts Gemini for:
- Mediamax Group presenters, DJs, news anchors, sports hosts (K24 TV, People Daily, Milele FM, Meru FM, Pilipili FM, Emoo FM, Kameme FM, Mayian FM, Msenangu FM) — writes to `discovery_creators` with `works_for = {Mediamax}`, plus contacts
- Shows on each station — writes to `shows` (name, station, kind, host_names, handles, niche, airtime, description, demographics estimate)
- Also seeds a curated "shows" pass for other major KE broadcasters (Royal Media, Radio Africa, Standard Group, NMG) so the tab isn't Mediamax-only

**Extend `discovery-seed`** (broader KE round): existing function already covers 25 niches × 5 platforms. Add a "audience_demo" ask to the prompt and store it. Add 6 new niches: media personalities, journalism, radio hosts, TV hosts, podcast hosts, activism.

**Auto-create Mediamax storefront items** from discovered talent: after Mediamax seed, for each `discovery_creators` with `works_for` containing `Mediamax` and `ai_confidence >= 0.6`, upsert an `inventory_items` row with `kind='influencer'`, `agency_id = 94a18a0b-...`, and copy demographics.

## 5. Discovery UI

Add a **Shows tab** (Tabs component) at the top of Discovery: `Creators | Shows`. Shows tab reuses the same filter/search bar layout:
- Search by show name, station, host
- Filter by kind (tv/radio/podcast), station, niche
- Card shows: logo, station badge, kind icon, airtime, host chips (linking to creator drawer), platform handle chips, reach estimate, demo strip
- Drawer: full description, contacts (`show_contacts`), hosts (with links to their creator profiles), platforms, "Add to roster" button (creates an owned_account inventory item for the show).

## 6. Fetch trigger

Add two buttons next to existing "Top up roster":
- **Seed Mediamax + shows** — invokes `discovery-seed-shows`
- **Broader KE round** — invokes `discovery-seed` with expanded niches

## Technical notes

- All schema in a single migration with GRANTs + RLS.
- `get_public_storefront` RPC updated to include `audience_demo` + `demo_source` per item.
- New RPC `get_show_by_id` for future public embeds (not wired to UI now).
- Filter logic stays client-side; storefront already fetches all items in one RPC call.
- Model: `google/gemini-3-flash-preview` for seed (same as existing).
- Non-goals for this pass: OAuth-based real demographic pulls (leverage existing `refresh-influencer-stats` later), show-level metrics polling, per-show public pages.

## Files to change

Migrations:
- new: `create shows + show_contacts, extend discovery_creators & inventory_items, update get_public_storefront`

Edge functions:
- new: `supabase/functions/discovery-seed-shows/index.ts`
- edit: `supabase/functions/discovery-seed/index.ts` (add demographics + new niches)

Frontend:
- `src/pages/PublicStorefront.tsx` — filter bar, demographics strip
- `src/pages/app/Discovery.tsx` — Tabs (Creators/Shows), Shows list + drawer, new seed buttons
