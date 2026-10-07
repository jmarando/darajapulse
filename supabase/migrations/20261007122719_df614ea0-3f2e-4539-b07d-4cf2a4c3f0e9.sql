ALTER TABLE public.creator_drafts ADD COLUMN IF NOT EXISTS posted_at timestamptz, ADD COLUMN IF NOT EXISTS video_deleted_at timestamptz;
UPDATE public.creator_drafts SET posted_at = updated_at WHERE post_url IS NOT NULL AND posted_at IS NULL;
CREATE OR REPLACE FUNCTION public.creator_drafts_set_posted_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.post_url IS NOT NULL AND NEW.posted_at IS NULL THEN NEW.posted_at := now(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS creator_drafts_posted_at ON public.creator_drafts;
CREATE TRIGGER creator_drafts_posted_at BEFORE INSERT OR UPDATE OF post_url ON public.creator_drafts FOR EACH ROW EXECUTE FUNCTION public.creator_drafts_set_posted_at();