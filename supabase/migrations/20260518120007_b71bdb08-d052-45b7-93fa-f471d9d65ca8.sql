-- Allow upserting contest entries by (contest_id, post_url) so the hashtag discovery
-- function can idempotently re-import the same post.
ALTER TABLE public.contest_entries
  ADD CONSTRAINT contest_entries_contest_post_unique UNIQUE (contest_id, post_url);