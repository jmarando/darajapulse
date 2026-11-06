-- Stories: let stories-sync save frames, and let creators send their own stories.

-- 1. stories-sync upserts with on_conflict=campaign_id,platform,external_id (see _shared/stories.ts, STORY_FRAME_KEY).
--    The only unique index used to be stories_external_uniq on (platform, external_id) WHERE external_id IS NOT NULL.
--    Postgres can only use a partial index for ON CONFLICT when the statement repeats its WHERE, and PostgREST never does,
--    so every save failed with 42P10 and the table stayed empty. That index also keyed a frame on platform and id alone,
--    so a frame for a creator on two campaigns would have been moved from one campaign to the other.
--    The new index isn't partial and includes the campaign, so a frame gets one row on each campaign it counts for.
--    Rows with no external_id (logged by staff, sent by creators) never clash, because NULLs are distinct in a unique index.
DROP INDEX IF EXISTS public.stories_external_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS stories_campaign_frame_uniq
  ON public.stories (campaign_id, platform, external_id);

-- 2. What the AI read from a creator's insights screenshot. It's kept apart from the numbers on the row, so a number the
--    creator typed over the reading can be shown as theirs.
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS ai_reading jsonb;

COMMENT ON COLUMN public.stories.ai_reading IS
  'Creator stories only: what the AI read from the screenshot, as {reach, views, replies, link_taps, insights, model, read_at}, or {error, model, read_at} when it could not read it. A row number that differs from this was typed by the creator.';
COMMENT ON COLUMN public.stories.source IS
  'manual: typed by staff. instagram_api: stories-sync. creator: sent by the creator from their brief link, with verified false until staff confirm it.';
