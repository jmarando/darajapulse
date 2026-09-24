ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS creative_group_id uuid;
ALTER TABLE public.contest_entries ADD COLUMN IF NOT EXISTS creative_group_id uuid;

CREATE INDEX IF NOT EXISTS posts_creative_group_idx
  ON public.posts (campaign_id, influencer_id, creative_group_id)
  WHERE creative_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contest_entries_creative_group_idx
  ON public.contest_entries (contest_id, influencer_id, creative_group_id)
  WHERE creative_group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payouts_campaign_influencer_unique
  ON public.payouts (campaign_id, influencer_id);

CREATE OR REPLACE FUNCTION public.submit_crossposted_entries(
  _token text,
  _links jsonb,
  _handle text,
  _submitter_name text,
  _submitter_email text,
  _brief_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _platform text;
  _post_url text;
  _result jsonb;
  _results jsonb := '[]'::jsonb;
  _group_id uuid := gen_random_uuid();
  _entry_id uuid;
  _post_id uuid;
  _seen_platforms text[] := ARRAY[]::text[];
  _seen_urls text[] := ARRAY[]::text[];
  _draft_id uuid;
BEGIN
  IF _links IS NULL OR jsonb_typeof(_links) <> 'array' OR jsonb_array_length(_links) < 1 OR jsonb_array_length(_links) > 5 THEN
    RAISE EXCEPTION 'Submit between 1 and 5 post links.';
  END IF;

  FOR _item IN SELECT value FROM jsonb_array_elements(_links)
  LOOP
    _platform := lower(btrim(coalesce(_item->>'platform', '')));
    _post_url := btrim(coalesce(_item->>'post_url', ''));

    IF _platform NOT IN ('tiktok','instagram','facebook','youtube','twitter') THEN
      RAISE EXCEPTION 'Each link must be from TikTok, Instagram, Facebook, YouTube or X.';
    END IF;
    IF length(_post_url) < 8 OR _post_url !~* '^https?://' THEN
      RAISE EXCEPTION 'Each post must have a valid public link.';
    END IF;
    IF _platform = ANY(_seen_platforms) THEN
      RAISE EXCEPTION 'Add only one link per platform for the same video.';
    END IF;
    IF lower(_post_url) = ANY(_seen_urls) THEN
      RAISE EXCEPTION 'The same link cannot be submitted twice.';
    END IF;

    _seen_platforms := array_append(_seen_platforms, _platform);
    _seen_urls := array_append(_seen_urls, lower(_post_url));

    _result := public.submit_contest_entry(
      _token,
      _platform,
      _post_url,
      _handle,
      _submitter_name,
      _submitter_email,
      _brief_token
    );
    _entry_id := (_result->>'entry_id')::uuid;
    _post_id := NULLIF(_result->>'post_id', '')::uuid;

    UPDATE public.contest_entries
       SET creative_group_id = _group_id
     WHERE id = _entry_id;

    IF _post_id IS NOT NULL THEN
      UPDATE public.posts
         SET creative_group_id = _group_id
       WHERE id = _post_id;
    END IF;

    _results := _results || jsonb_build_array(_result || jsonb_build_object('platform', _platform, 'post_url', _post_url));
  END LOOP;

  IF _brief_token IS NOT NULL THEN
    SELECT d.id INTO _draft_id
      FROM public.creator_drafts d
      JOIN public.campaign_influencers ci ON ci.id = d.campaign_influencer_id
     WHERE ci.brief_token = _brief_token
       AND d.status = 'approved'
       AND d.post_url = (_links->0->>'post_url')
     ORDER BY d.reviewed_at DESC NULLS LAST, d.created_at DESC
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'creative_group_id', _group_id,
    'draft_id', _draft_id,
    'results', _results,
    'post_ids', (SELECT coalesce(jsonb_agg(value->>'post_id') FILTER (WHERE value->>'post_id' IS NOT NULL), '[]'::jsonb) FROM jsonb_array_elements(_results))
  );
END
$function$;

REVOKE ALL ON FUNCTION public.submit_crossposted_entries(text,jsonb,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_crossposted_entries(text,jsonb,text,text,text,text) TO anon, authenticated, service_role;