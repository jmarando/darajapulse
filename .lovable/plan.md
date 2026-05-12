## Why

The campaign page currently stacks ~14 cards vertically: header → KPIs → performance chart → top performer → channel mix → audience → agency team → roster → posts → content calendar → learnings → 2 share CTAs → contests → side sheet. Everything competes for attention, scroll length is huge, and related actions (share plan, share report, edit brief) live far apart.

## New structure

```
┌────────────────────────────────────────────────────────────┐
│  HERO                                                       │
│  client · campaign name                  [Share ▾] [···]    │
│  hashtag · dates · status pill                              │
│  ─────────────────────────────────────────────────────────  │
│  4 hero KPIs:  Views · Engagement · Creators · Fees        │
│  (with delta vs prior period if available)                  │
└────────────────────────────────────────────────────────────┘

┌── TABS ───────────────────────────────────────────────────┐
│  Overview │ Roster │ Content │ Performance │ Brief │ Wrap │
└────────────────────────────────────────────────────────────┘

Overview      → at-a-glance: trend chart + channel mix + top
                performer + audience snapshot, in a 2-col grid
Roster        → creators table + add creator + agency team
Content       → posts grid + content calendar shortcut
Performance   → full trend chart, metric switcher, contests
Brief         → campaign brief, template, share-plan CTA
Wrap          → learnings, share-report CTA, export
```

Right rail (desktop ≥ lg) inside Overview only:
- Quick share panel (plan link + report link, copy buttons)
- Status summary (X of Y confirmed, fees committed, deliverables)

## Detailed changes

### Hero
- Single header band: client crumb, campaign title, status pill, primary actions condensed into one `[Share ▾]` menu (Plan link, Brief preview, Report link) plus a `[···]` overflow (Edit, Archive).
- Move hashtag / dates / fees-committed / deliverables from the current sub-line into a clean 4-up KPI strip directly below the title. KPIs: Views, Engagement %, Creators (`confirmed/total`), Fees (KES).

### Tabs (shadcn `Tabs`, URL-synced via `?tab=`)
1. **Overview** — 2-col grid:
   - Left col: performance trend (compact, last 14d default)
   - Right col: channel mix donut, top performer card, audience snapshot
   - Sticky right rail with share + status (lg+)
2. **Roster** — existing creators table + agency team picker collapsed under a "Team" disclosure
3. **Content** — posts grid + "Open content calendar" link card
4. **Performance** — full-width trend with metric switcher, then Contests section
5. **Brief** — campaign brief, template selector, share-plan CTA
6. **Wrap** — learnings & recommendations, share-report CTA

### Removed/merged
- Two separate "Share roster" and "Share with brand" CTA cards → folded into the single hero `[Share ▾]` menu and the Brief / Wrap tabs.
- Top performer + channel mix + audience demoted from full-width cards to Overview right-column tiles.
- Contests moved out of the main scroll into Performance tab.

### Side sheet (selected creator)
- Keep, but tighten: 3-up KPI grid (Fee, Deliverables w/ breakdown, Status), then posts list, then actions menu. No structural change beyond spacing and removing duplicate labels.

## Technical notes

- New file `src/pages/app/campaign/CampaignHero.tsx` and one component per tab (`OverviewTab`, `RosterTab`, `ContentTab`, `PerformanceTab`, `BriefTab`, `WrapTab`) under `src/pages/app/campaign/`. Lifts the giant `CampaignDetail.tsx` (1100+ lines) into ~150-line modules.
- `CampaignDetail.tsx` becomes the data-loading shell: keeps `load()`, state, and passes data + handlers down via props. No backend changes.
- Tabs sync to URL via `useSearchParams` so deep links work and refresh keeps you on the right tab.
- Reuse all existing logic (totals, byInfluencer, trend, audience, channel mix, contests, learnings) — just relocated.
- Mobile: tabs become a horizontal scrollable strip; right rail collapses inline at the bottom of Overview.

## Out of scope
- No new metrics, no schema changes, no copy rewrites beyond labels needed by the new structure.
- Visual tokens unchanged (same Card, font-display, spacing scale).
