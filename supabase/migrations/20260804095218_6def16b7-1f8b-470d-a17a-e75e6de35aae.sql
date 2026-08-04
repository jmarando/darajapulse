
INSERT INTO public.brief_templates (
  id, client_id, agency_id, name, objective, brief, hashtag, content_format, tone,
  dos, donts, mandatory_mentions, hashtags_extra
)
SELECT
  '9b1f2a6c-2c1e-4d3a-9c2f-9a1b7c5d4e11'::uuid,
  c.client_id,
  c.agency_id,
  'Pakakumi Aug–Oct Brand Awareness',
  'Own exclusive brand promotion for Pakakumi across August–October: build top-of-mind brand awareness, grow Pakakumi''s TikTok, Facebook and Instagram communities, and convert creator audiences into followers and active players through a consistent weekly Reel + Stories rhythm.',
  'Exclusivity: For the full contracted period (August–October 2026) the Marketer promotes Pakakumi exclusively. No other betting, casino, crash-game, lottery or gaming brand may appear in the Marketer''s content, bio, pinned posts or collaborations.

Who we are talking to: 18–35 East African, mobile-first audiences (Kenya lead, Tanzania secondary) who live on TikTok, Instagram Reels and X. They come for banter, football, hustle stories and everyday humour — not for ads.

Why now: Off the back of the World Cup push, the job for August–October is sustained presence. Fewer big spikes, more consistent weekly drumbeat so Pakakumi stays in the feed and in the conversation between big sporting moments.

Key message: "Epuka aibu. Cheza Pakakumi." Pakakumi is the fast, fair, home-grown place to play — crash games and sports, cash out when you want.

WEEKLY DELIVERABLES (per Marketer, per week, for the contracted period)
• 1 × Reel — posted on the Marketer''s own Facebook, TikTok and Instagram accounts
• 3 × Stories — supporting the Reel or standalone brand moments
• Each Reel focuses on a product feature or brand promotion (crash game, cash out, quick deposit/withdrawal, bonuses, live sports)
• Each Reel must tag and use the Collab feature with Pakakumi''s official account
• Pakakumi logo placement on every video (corner watermark throughout, plus end-card)
• Every post asks the audience to follow Pakakumi on social media, with the handle on screen and in caption

PLATFORM FOCUS
Priority order for growth and engagement: TikTok → Facebook → Instagram. X/Twitter is used as a supporting amplification channel for match-day and reaction posts.

CONTENT ANGLES TO PICK FROM
• Product explainers — how the crash game works, cashing out at the right moment
• Wins and near-misses reaction content (no winnings guarantees)
• "Follow Pakakumi" call-outs baked into a skit rather than tacked on
• Everyday Kenyan life scenarios where a quick play fits naturally
• Match-day picks and second-screen banter during major fixtures
• Bonus/promo call-outs when Pakakumi is running one

MEASUREMENT
Reported weekly in DarajaPulse: reach and views, engagement rate, follower growth on @pakakumi across TikTok / Facebook / Instagram, and Story completion where available. Post links are captured in the campaign so metrics refresh automatically.',
  '#ChezaPakakumi',
  '1 × Reel per week (30–60s, vertical 9:16, burnt-in captions, Pakakumi logo watermark + end-card) cross-posted to TikTok, Facebook and Instagram, plus 3 × Stories per week. Every Reel published as a Collab with Pakakumi''s official account.',
  'Conversational, community-first and playful. Sheng and Swahili welcome. Confident, never preachy — banter and storytelling ahead of a sales pitch.',
  ARRAY[
    'Post 1 Reel and 3 Stories every week on Facebook, TikTok and Instagram',
    'Tag and Collab with Pakakumi''s official account on every Reel',
    'Keep the Pakakumi logo on screen for the full video and close on the logo end-card',
    'Ask the audience directly to follow Pakakumi on social media',
    'Show the Pakakumi app or site on screen for at least 3 seconds',
    'Use #ChezaPakakumi and #EpukaAibu and tag @pakakumi in the caption',
    'Include the 18+ responsible gaming line in every caption',
    'Share post links with the DarajaPulse team on the day of posting'
  ]::text[],
  ARRAY[
    'No promotion of any other betting, casino, crash-game or gaming brand during the contracted period',
    'No guarantees of winnings or "sure bet" language',
    'Do not target, feature or appeal to anyone under 18',
    'Avoid religious, tribal or political angles',
    'No competitor mentions (Sportpesa, Betika, Odibets, 1xBet and others)',
    'Do not promise specific odds or payouts — they change live',
    'Do not delete or archive campaign posts before the end of the contracted period'
  ]::text[],
  ARRAY['@pakakumi','Pakakumi','18+ T&Cs apply. Play responsibly.']::text[],
  ARRAY['#ChezaPakakumi','#EpukaAibu','#PlayPakakumi']::text[]
FROM public.campaigns c
WHERE c.id = '97b5d34f-51c4-496c-9694-73251aab732d'
ON CONFLICT (id) DO NOTHING;

UPDATE public.campaigns c
SET brief_template_id = '9b1f2a6c-2c1e-4d3a-9c2f-9a1b7c5d4e11',
    objective = bt.objective,
    brief = bt.brief,
    hashtag = bt.hashtag,
    content_format = bt.content_format,
    tone = bt.tone,
    dos = bt.dos,
    donts = bt.donts,
    mandatory_mentions = bt.mandatory_mentions,
    hashtags_extra = bt.hashtags_extra,
    start_date = COALESCE(c.start_date, DATE '2026-08-01'),
    end_date = COALESCE(c.end_date, DATE '2026-10-31')
FROM public.brief_templates bt
WHERE bt.id = '9b1f2a6c-2c1e-4d3a-9c2f-9a1b7c5d4e11'
  AND c.id = '97b5d34f-51c4-496c-9694-73251aab732d';
