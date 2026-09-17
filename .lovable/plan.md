# Part A — Clean up duplicate creators and broken profile links

Discovery currently holds 2,456 profile records. Two problems show up on the cards:

- **Duplicates** — the same person appears as several cards because names differ slightly ("Joe Mfalme" vs "DJ Joe Mfalme") or the same account was saved twice under handle variants (`djjoemfalme` and `deejayjoemfalme`, both 1.3M followers).
- **Broken links** — 348 Instagram entries and some others were saved with a YouTube channel ID as the handle (e.g. `UCrm6VAE5i9HU3qzENYHBHQQ`), so the Instagram link can never open. Vinnie's card is one of these cases: the saved Instagram name doesn't lead to a real page.

Nothing gets deleted automatically, and no handle is invented.

## What you'll be able to do

1. **Smarter grouping on the cards.** Name matching will ignore common prefixes and titles (DJ, MC, Dr, Mr, Official) and will also join profiles that share the same handle across networks. "Joe Mfalme" and "DJ Joe Mfalme" become one card with both profiles listed.

2. **A "Possible duplicates" review panel** in Discovery. It lists suggested groups with the reason (same handle, near-identical name, same handle + same follower count), shows each profile side by side, and gives you **Merge** or **Not the same person** per group. Your decisions stick — merged people stay merged even if a name changes later, and "not the same" pairs never resurface.

3. **Link health.** Every profile is checked against simple rules: a YouTube channel ID used as an Instagram/TikTok handle, an empty link, or a link pointing at the wrong network. Those show a "link needs fixing" badge instead of a dead link, and a new filter lets you list only the broken ones. You can type the correct handle in the profile drawer; the link rebuilds itself and the badge clears.

4. **Vinnie and the other 348.** These get flagged rather than guessed at. Once Instagram names are corrected (by you, or by the enrichment run when the scraping account is back), the badges disappear. Vinnie's card gets corrected by hand as part of this work if you can confirm the right Instagram name.

## Technical outline

**Database (additive only, nothing dropped)**
- `discovery_creators`: add `person_key text` (nullable) — set when profiles are merged; grouping prefers it over name matching.
- New `discovery_duplicate_decisions` table (`key_a`, `key_b`, `decision` merged/rejected, `decided_by`, timestamps) with RLS mirroring `discovery_creators` (agency staff read, admins write) plus GRANTs.
- `link_status` is derived in code, not stored — no schema churn if the rules change.

**Frontend (`src/pages/app/Discovery.tsx`, plus a small `src/lib/discoveryDedupe.ts`)**
- `normalizeName` gains prefix/title stripping and diacritic folding; grouping keys become `person_key ?? normalizedName`, with a second pass joining groups that share a normalised handle.
- `profileLinkIssue(row)` helper: returns `"missing" | "wrong_network" | "youtube_id_as_handle" | null`; used for the badge, the filter, and to disable the anchor.
- New "Possible duplicates" tab next to Shows: candidate builder over loaded rows, grouped by handle/name similarity, excluding rejected pairs; Merge writes a shared `person_key` to the selected rows.
- Profile drawer gets an editable handle field for flagged rows (admin only, matching existing update policy); saving rewrites `handle` and `profile_url` from the platform's URL pattern.

**No changes** to influencers, campaigns, reporting, or tenant scoping.

## Out of scope

- Automatically re-scraping Instagram to discover correct handles (the scraping account is still suspended for unpaid invoices).
- Deleting any profile records.
