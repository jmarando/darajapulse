CREATE OR REPLACE FUNCTION public.creator_drafts_sync_crosspost_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.creative_group_id IS NOT NULL AND NEW.influencer_id IS NOT NULL THEN
    UPDATE public.creator_drafts d
       SET post_url = COALESCE(d.post_url, NEW.post_url)
      FROM public.campaign_influencers ci
      JOIN public.contests c ON c.campaign_id = ci.campaign_id
     WHERE ci.id = d.campaign_influencer_id
       AND ci.influencer_id = NEW.influencer_id
       AND c.id = NEW.contest_id
       AND d.status = 'approved'
       AND (d.posted_entry_id = NEW.id OR d.posted_entry_id IN (
         SELECT e.id FROM public.contest_entries e
          WHERE e.creative_group_id = NEW.creative_group_id
       ));
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS contest_entries_sync_crosspost_links ON public.contest_entries;
CREATE TRIGGER contest_entries_sync_crosspost_links
AFTER INSERT OR UPDATE OF creative_group_id ON public.contest_entries
FOR EACH ROW EXECUTE FUNCTION public.creator_drafts_sync_crosspost_links();

REVOKE ALL ON FUNCTION public.creator_drafts_sync_crosspost_links() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.creator_drafts_sync_crosspost_links() TO service_role;