# Campaign Reporting & Deliverables Intelligence

## What I found in the current system

- **Posts are the only publication record** — 915 posts across 11 campaigns and 119 creators, each tied to one campaign, one creator and one platform (Instagram 438, TikTok 401, Facebook 65, Twitter 10, YouTube 1). 859 carry captions.
- **Performance figures** live in a separate history table, one row per refresh; reporting already uses the "peak value per post" rule, which I will keep.
- **Creator uploads** (146 videos, 70 with live links) are already the natural "one piece of content, posted in several places" record — creators recently got the option to tick several platforms for a single upload.
- **The content calendar table is empty** (unused), so nothing needs migrating from it.
- Same-caption-same-creator-same-campaign clusters already exist in the data (e.g. one video on TikTok + Instagram + Facebook), confirming cross-posting is real and currently counted three times.

No duplicate structures will be created: creators, campaigns, posts and performance history stay exactly as they are.

## The one schema addition

A **deliverable** record (campaign + creator + title + content type + expected platforms + status + due date + notes) and a single new link column on existing posts pointing at its deliverable. Nothing else changes, so every existing page keeps working; posts without a deliverable are simply treated as a deliverable of one.

Approved creator uploads become deliverables automatically, and their live links attach to them.

## How posts get grouped

A backfill and an ongoing matcher group posts into one deliverable only when they agree on: same campaign, same creator, near-identical caption (normalised, ignoring punctuation, hashtags and emoji), posted within a short window of each other, and different platforms. Two posts on the same platform are never merged. Anything that is a near-miss is offered as a **suggestion** the user confirms or dismisses — never merged silently. Manual link/unlink is always available.

## Counting rules

- Unique deliverables = distinct deliverable groups (an ungrouped post counts as one).
- Platform publications = post count.
- Consolidated performance = sum of each platform post's peak figures.
- Platform breakdown = same figures split by platform, plus how many distinct deliverables that platform represents.
- Engagement = likes + comments + shares + saves; rate = engagement ÷ views.

## The Reporting section

New **Reports** item in the main navigation. Top bar: client, campaign, creator, platform, content type, deliverable status, month and custom date range — all combinable.

Summary cards: Unique Deliverables, Platform Publications, Views, Engagement, Likes, Comments.

Tabs:
1. **Summary** — campaign header, totals, platform and creator breakdown, monthly views/engagement trend charts.
2. **By Influencer** — per creator: deliverables, publications, per-platform publication counts, totals, engagement rate, expandable monthly rows.
3. **By Platform** — publications, deliverables represented, totals, engagement rate, comparison chart.
4. **By Month** — month rows with deliverables/publications/totals, drill down month → creator → deliverable → publication.
5. **Deliverables register** — title, creator, platforms, publication count, consolidated figures, status; row opens the linked publications with manual link/unlink and grouping suggestions.
6. **Detailed posts** — every publication with its own figures and link.

## Exports

Excel, CSV and print/PDF, all respecting the active filters, in both summary and detailed form (detailed lists every deliverable with its linked publications).

## Build order

1. Deliverable record, link column, access rules, backfill of existing posts into deliverables.
2. Reporting page, filters, summary cards, summary tab.
3. Influencer, platform and monthly tabs with charts and drill-down.
4. Exports.
5. Grouping suggestions plus manual link/unlink tools.

## Assumptions and limits

- Grouping relies on caption and timing similarity; we do not compare the actual video files, so odd cases are surfaced as suggestions rather than auto-merged.
- Reach, saves and clicks appear only where the platform supplies them; estimated values stay labelled as today.
- Monthly grouping uses each post's publication date; performance is the latest known peak, not a per-month delta, unless a date range is applied.
