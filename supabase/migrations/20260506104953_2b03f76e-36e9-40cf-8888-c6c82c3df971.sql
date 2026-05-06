-- Add slug columns
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS slug text;

-- Slugify helper
CREATE OR REPLACE FUNCTION public.slugify(_s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(_s,'')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Backfill
UPDATE public.clients SET slug = public.slugify(name) WHERE slug IS NULL OR slug = '';
UPDATE public.campaigns SET slug = public.slugify(name) WHERE slug IS NULL OR slug = '';

-- Uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS clients_slug_unique ON public.clients(slug);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_client_slug_unique ON public.campaigns(client_id, slug);

-- Triggers to auto-populate
CREATE OR REPLACE FUNCTION public.set_client_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN NEW.slug := public.slugify(NEW.name); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_campaign_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN NEW.slug := public.slugify(NEW.name); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_client_slug ON public.clients;
CREATE TRIGGER trg_set_client_slug BEFORE INSERT OR UPDATE OF name, slug ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_client_slug();

DROP TRIGGER IF EXISTS trg_set_campaign_slug ON public.campaigns;
CREATE TRIGGER trg_set_campaign_slug BEFORE INSERT OR UPDATE OF name, slug ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_slug();
