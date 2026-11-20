-- Listening: news and the web.
--
-- The listening-news function reads the Kenyan outlets' and blogs' own feeds every hour and searches the news and the
-- web (Serper) for each active keyword about once a day, storing strict matches in listening_mentions as source 'news'
-- (a named outlet) or 'web' (any other site or blog). listening_mentions.source takes any text, so no change there.
--
-- What this adds:
--   * listening_topics.news_searched_at: when a keyword last had its news and web search (null: never), so each is
--     searched about once a day, the oldest first. Only the service role writes it; keyword forms don't send it.
--   * An internal_job_keys row named listening-news. The key is made by the table's default.
--   * Cron job listening-news-hourly at minute 50 (the social sweep runs at 25, alerts at 40), through
--     invoke_job_function.
--
-- To undo:
--   SELECT cron.unschedule('listening-news-hourly');
--   DELETE FROM public.internal_job_keys WHERE name = 'listening-news';
--   ALTER TABLE public.listening_topics DROP COLUMN IF EXISTS news_searched_at;
--   (News and web posts already stored stay in listening_mentions; delete them by source if wanted.)

ALTER TABLE public.listening_topics ADD COLUMN IF NOT EXISTS news_searched_at timestamptz;

INSERT INTO public.internal_job_keys(name) VALUES ('listening-news') ON CONFLICT (name) DO NOTHING;

SELECT cron.schedule('listening-news-hourly', '50 * * * *',
  $$SELECT public.invoke_job_function('listening-news', '{}'::jsonb)$$);
