# Influencer Discovery — Kenya

A new left-nav section ("Discovery") with a prefilled roster of Kenyan influencers across Instagram, TikTok, YouTube, X and Facebook, plus a form-driven AI matchmaker that ranks the best fits for a given product brief.

## 1. New left-nav entry

- Add `Discovery` (Compass icon) in `AppShell` sidebar, route `/app/discovery`.
- Keep the existing `Influencers` (roster) section — Discovery is a separate, larger surface focused on finding and vetting creators, not managing the agency's signed roster.
- "Add to roster" action on each Discovery card copies the creator into `influencers` so existing campaign flows just work.

## 2. Data model (new tables)

```text
discovery_creators
  id, full_name, handle, platform, profile_url,
  niche (text[]), region, city,
  follower_count, engagement_rate,
  bio, avatar_url,
  source ('ai_seed' | 'manual' | 'enriched'),
  ai_confidence (0-1),         -- how sure the AI was
  verified_at,                  -- nullable, set when a human confirms
  created_at, updated_at

discovery_contacts            -- 1-to-many, public + private
  id, creator_id,
  kind ('email'|'phone'|'whatsapp'|'manager_email'|'agency'|'link'),
  value, label, is_public, added_by, created_at

discovery_searches            -- audit + re-rank cache
  id, user_id, brief jsonb, results jsonb, created_at
```

RLS: agency_admin + account_manager can read/write everything; contacts marked `is_public=false` only visible to authenticated team. All tables: standard GRANTs.

## 3. Prefilling the Kenya roster (AI-generated seed)

A one-shot admin action ("Seed Kenya roster") calls a new edge function `discovery-seed` which:

1. Iterates a fixed list of ~25 niches × 5 platforms (food, beauty, comedy, fitness, fashion, parenting, finance, gospel, tech, travel, sports, gaming, lifestyle, music, news/politics, automotive, hair, skincare, wedding, hustle/SME, agribusiness, education, real estate, motherhood, nightlife).
2. For each (niche, platform) prompts `google/gemini-3-flash-preview` with structured output (zod schema) asking for ~15 well-known Kenyan creators with: name, handle, profile URL, est. followers, est. engagement %, city, short bio, public contact (email/WhatsApp) **if known**, confidence.
3. De-dupes by `(platform, handle)` and inserts into `discovery_creators` with `source='ai_seed'`.

Expected scale: ~25 × 5 × 15 ≈ ~1,800 raw rows → ~1,000-1,500 after dedupe. Run in batched parallel calls (e.g. 8 at a time) with progress toast.

Re-seeding is idempotent: `onConflict (platform, handle) do update set ai_confidence = greatest(...)`, never overwrites human-verified fields.

Honest caveat shown in UI: "AI-suggested — verify before outreach." A `Verify` button on each card flips `verified_at` and locks key fields.

## 4. Roster UI (`/app/discovery`)

Left: filter sidebar
- Platform multi-select (IG, TikTok, YouTube, X, Facebook)
- Niche multi-select (chips from distinct niches)
- Follower range slider (1K–5M)
- Engagement min (%)
- City (Nairobi, Mombasa, Kisumu, …)
- Verified only toggle
- Has contact toggle

Right: card grid (reuse styling from `Influencers.tsx`)
- Avatar, name, @handle linking to profile_url
- Platform icon, followers (compact), engagement %, city
- Niche chips, confidence badge ("AI-suggested" vs "Verified")
- Quick actions: View details · Copy handle · Add to roster

Detail drawer (click card):
- Profile summary
- **Contacts** list with inline add/edit ("Add email", "Add WhatsApp", public/private toggle). Stored in `discovery_contacts`. This is the user-requested "upload/update contacts where available" path.
- Notes (textarea, agency-only)
- "Add to influencer roster" → inserts into `influencers`

## 5. AI matchmaker (form + ranking)

Top of page: "Find creators for a brief" card.
- Form fields: product/brand, category, target audience, region (default Kenya), platforms (multi), budget tier (micro/mid/macro), goal (awareness/conversions/UGC), notes.
- On submit → edge function `discovery-match`:
  1. Pulls candidate creators from `discovery_creators` filtered by chosen platforms + rough follower band for the budget tier (SQL prefilter, ~200 rows max).
  2. Sends the brief + the candidate shortlist (compact JSON: id, handle, niche, followers, city, bio) to `google/gemini-3-flash-preview` with a structured `Output.object` schema asking for top 15 ranked matches with `creator_id`, `score (0-100)`, `reason (1 sentence)`, `suggested_angle`.
  3. Returns ranked results; UI shows them as a re-ordered card list above the full roster with a "Match: 87 — great fit for Nairobi Gen-Z beauty" badge.
- Result is saved in `discovery_searches` so the user can revisit recent briefs.

## 6. Edge functions

- `supabase/functions/discovery-seed/index.ts` — batched AI generation + upsert. Admin-only (JWT check + `has_role('agency_admin')`).
- `supabase/functions/discovery-match/index.ts` — runs the ranking call. Authenticated team members.

Both use the existing Lovable AI gateway pattern (`LOVABLE_API_KEY`, `google/gemini-3-flash-preview`, structured output via `Output.object` + zod). No new secrets needed.

## 7. Out of scope (explicit non-goals for v1)

- Live scraping / Apify / Firecrawl enrichment (can be a v2 "Refresh stats" button per card).
- Audience demographics, fake-follower scoring (requires paid API).
- DM/outreach automation — Discovery just surfaces contacts; outreach stays manual or moves through existing campaign briefs.

## Technical notes

- Frontend: new `src/pages/app/Discovery.tsx`, `DiscoveryDetailDrawer.tsx`, route wired in `App.tsx`, nav item in `AppShell.tsx`.
- Reuse `PlatformPicker`, card styling, and `fmtCompact` from `Influencers.tsx`.
- Seed run is async; show progress via a row in a new `discovery_seed_runs` table or just toast count.
- Costs: seeding ~125 LLM calls (one per niche×platform), each ~2-4K tokens → modest one-time AI spend. Matchmaker is ~1 call per search.

Ship order: tables + RLS → Discovery page shell + nav → seed function + admin button → matchmaker form → detail drawer with contacts editor.
