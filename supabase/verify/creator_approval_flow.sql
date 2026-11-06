-- All potentially writing calls run in one rolled-back transaction.
BEGIN;

DO $$
DECLARE
  _uber_token text;
  _royco_brief text;
BEGIN
  SELECT ct.submission_token INTO _uber_token
  FROM public.contests ct
  WHERE ct.campaign_id = '9dfe7ba5-7d12-44f3-9272-bec28d3b0799'
  ORDER BY ct.created_at LIMIT 1;
  SELECT ci.brief_token INTO _royco_brief
  FROM public.campaign_influencers ci
  WHERE ci.campaign_id = '00c5d644-349a-4320-8321-3c7aca3db6ac'
  LIMIT 1;

  BEGIN
    PERFORM public.submit_contest_entry(
      _uber_token, 'instagram', 'https://instagram.com/reel/cross-campaign-check',
      'test', 'Test', 'test@example.com', _royco_brief
    );
    RAISE EXCEPTION 'cross-campaign personal link was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'This personal link does not belong to this campaign. Open the submission link from your own brief.' THEN
      RAISE;
    END IF;
  END;
END $$;

DO $$
DECLARE
  _uber_token text;
  _uber_brief text;
  _ci_id uuid;
BEGIN
  SELECT ct.submission_token INTO _uber_token
  FROM public.contests ct
  WHERE ct.campaign_id = '9dfe7ba5-7d12-44f3-9272-bec28d3b0799'
  ORDER BY ct.created_at LIMIT 1;
  SELECT ci.id, ci.brief_token INTO _ci_id, _uber_brief
  FROM public.campaign_influencers ci
  WHERE ci.campaign_id = '9dfe7ba5-7d12-44f3-9272-bec28d3b0799'
  LIMIT 1;
  UPDATE public.creator_drafts SET status = 'changes_requested', post_url = NULL
  WHERE campaign_influencer_id = _ci_id;

  BEGIN
    PERFORM public.submit_contest_entry(
      _uber_token, 'instagram', 'https://instagram.com/reel/no-approval-check',
      'test', 'Test', 'test@example.com', _uber_brief
    );
    RAISE EXCEPTION 'unapproved video was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Upload this video for approval first — you can only share its live link once the team has approved it.' THEN
      RAISE;
    END IF;
  END;
END $$;

DO $$
DECLARE
  _royco_token text;
  _brief text;
  _ci_id uuid;
BEGIN
  SELECT ct.submission_token INTO _royco_token
  FROM public.contests ct
  WHERE ct.campaign_id = '00c5d644-349a-4320-8321-3c7aca3db6ac'
  ORDER BY ct.created_at LIMIT 1;
  SELECT ci.id, ci.brief_token INTO _ci_id, _brief
  FROM public.campaign_influencers ci
  WHERE ci.campaign_id = '00c5d644-349a-4320-8321-3c7aca3db6ac'
    AND EXISTS (
      SELECT 1 FROM public.creator_drafts d
      WHERE d.campaign_influencer_id = ci.id AND d.status = 'approved'
    )
  LIMIT 1;
  UPDATE public.creator_drafts
  SET post_url = COALESCE(post_url, 'https://instagram.com/reel/previously-linked-check')
  WHERE campaign_influencer_id = _ci_id AND status = 'approved';

  BEGIN
    PERFORM public.submit_contest_entry(
      _royco_token, 'instagram', 'https://instagram.com/reel/second-video-check',
      'test', 'Test', 'test@example.com', _brief
    );
    RAISE EXCEPTION 'a second video reused an earlier approval';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Upload this video for approval first — you can only share its live link once the team has approved it.' THEN
      RAISE;
    END IF;
  END;
END $$;

-- Give the Uber creator a required agreement only inside this transaction.
UPDATE public.campaigns
SET contract_template_id = (
  SELECT contract_template_id FROM public.campaigns
  WHERE id = '00c5d644-349a-4320-8321-3c7aca3db6ac'
)
WHERE id = '9dfe7ba5-7d12-44f3-9272-bec28d3b0799';

DO $$
DECLARE
  _brief text;
BEGIN
  SELECT brief_token INTO _brief FROM public.campaign_influencers
  WHERE campaign_id = '9dfe7ba5-7d12-44f3-9272-bec28d3b0799' LIMIT 1;

  BEGIN
    PERFORM public.submit_creator_draft(
      _brief, 'unsigned-check.mp4', 'unsigned-check.mp4', 'video/mp4',
      1000, 'instagram', NULL, NULL, NULL, 'stream-check'
    );
    RAISE EXCEPTION 'unsigned current upload was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Please sign your creator agreement on your brief page before uploading videos.' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.submit_creator_draft(
      _brief, 'unsigned-check.mp4', 'unsigned-check.mp4', 'video/mp4',
      1000, 'instagram', NULL, NULL, NULL
    );
    RAISE EXCEPTION 'unsigned legacy upload was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Please sign your creator agreement on your brief page before uploading videos.' THEN
      RAISE;
    END IF;
  END;
END $$;

ROLLBACK;
SELECT 'creator approval checks passed' AS result;
