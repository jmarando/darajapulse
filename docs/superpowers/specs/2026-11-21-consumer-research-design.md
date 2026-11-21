# Consumer research: design

Based on Maier et al., *LLMs Reproduce Human Purchase Intent via Semantic Similarity Elicitation of Likert Ratings* (PyMC Labs and Colgate-Palmolive). Synthetic respondents answer in their own words; each answer is embedded and compared with five anchor statements to give a 1–5 distribution (semantic similarity rating, SSR). On 57 US personal-care concept surveys this reached about 90% of human test–retest reliability for ranking concepts, with realistic answer spreads.

## Who it's for

- Agency staff: test concepts, claims and prices for a brand or a pitch (a prospect is added as a client first).
- Campaigns: test ads and creator videos before they go live.
- Brands signed directly: run their own studies from the portal.

Access matches Listening (`can_access_listening`): the brand's agency staff, super admins and the brand's portal users.

## What a study is

- **Template**: concept test, ad/video test, price test, or custom (`_shared/research-templates.ts`). Template measures have fixed wording and anchors, re-applied when a study starts, so studies stay comparable.
- **Custom questions** (up to 5): the AI drafts five anchors, a person edits and approves them, and results label them "Untested".
- **Stimuli** (1–5): written concept, image, or video, each with an optional price.
- **Panel**: country (from `clients.country`), size (50/100/200/300), shares by age band, gender, region, setting, income tier and language, and up to six mindsets. A written audience can fill the shares (the AI suggests, a person checks). Respondents are drawn with exact quotas and a seed from the study id (`_shared/research-panel.ts`).

## How a study runs (`research-run`)

1. **Start** (user): checks the draft, claims it (draft → running) before taking units, charges `studyCost` from the brand's monthly allowance (`take_research_units`), draws the panel and queues one response per respondent × stimulus. Any failure puts it back to draft and returns the units.
2. **Videos**: one neutral, scene-by-scene account per video, from the video itself when the gateway takes it (`video_url`, then `image_url` data URL), otherwise from key frames taken in the browser at upload plus the script. The study records which (`account_source`).
3. **Answers** (minutely job, or straight after Start): batches of 24 are claimed with `claimed_until`, 6 at a time. Each respondent sees the stimulus once (text, image, the video account plus frames, or the whole video in full-watch mode) and answers every question as JSON; Likert answers are embedded and scored against their anchors with the same embedding model (`_shared/research-ssr.ts`). Three tries per answer.
4. **Finish**: the AI writes a read-out from the scores and a spread of quotes; units for failed answers go back. A 402/429 from the gateway pauses the run without spending retries; a study still running after 6 hours is stopped and its remaining units go back.
5. **Cancel** (user): marks pending answers failed and returns their units, plus any unwritten video accounts.

## Units and allowance

1 unit per respondent per text/image stimulus or video in summary mode; 5 per respondent in full-watch mode (panels up to 50); 10 per video for its account. Each brand has a monthly allowance (300 by default) per Nairobi month, set by super admins on the Research page.

## Results

Scores table (mean and top-two box per question and option, best marked), answer spread with 95% interval, split by segment, quotes sorted by score, the read-out, how each video was described, and a CSV of all answers. A method note on every result says these are synthetic respondents, good for comparing options and finding barriers, not yet checked against Kenyan or Ugandan panels, and not a sales forecast. Missing scores show as a dash, never 0.

## Not yet verified

The Lovable gateway's request shapes for embeddings and video aren't documented. The client tries the shapes above in order and reports which worked; the first live study confirms them.
