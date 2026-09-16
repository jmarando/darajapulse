CREATE TABLE IF NOT EXISTS public.countries (
  code text PRIMARY KEY,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Countries readable by everyone" ON public.countries FOR SELECT USING (true);
CREATE POLICY "Super admins manage countries" ON public.countries FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES public.countries(code) ON UPDATE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, name)
);
GRANT SELECT ON public.cities TO anon, authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cities readable by everyone" ON public.cities FOR SELECT USING (true);
CREATE POLICY "Super admins manage cities" ON public.cities FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.countries (code, name, sort_order) VALUES
  ('KE','Kenya',1),('TZ','Tanzania',2),('UG','Uganda',3),('ZM','Zambia',4),
  ('RW','Rwanda',5),('NG','Nigeria',6),('GH','Ghana',7),('ZA','South Africa',8)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.cities (country_code, name) VALUES
  ('KE','Nairobi'),('KE','Mombasa'),('KE','Kisumu'),('KE','Nakuru'),('KE','Eldoret'),
  ('KE','Thika'),('KE','Nyeri'),('KE','Machakos'),('KE','Malindi'),('KE','Kericho'),
  ('KE','Meru'),('KE','Naivasha'),('KE','Kakamega'),('KE','Kitale'),('KE','Diani'),
  ('TZ','Dar es Salaam'),('TZ','Arusha'),('TZ','Mwanza'),('TZ','Dodoma'),('TZ','Zanzibar City'),('TZ','Mbeya'),('TZ','Morogoro'),
  ('UG','Kampala'),('UG','Entebbe'),('UG','Jinja'),('UG','Gulu'),('UG','Mbarara'),('UG','Mbale'),
  ('ZM','Lusaka'),('ZM','Kitwe'),('ZM','Ndola'),('ZM','Livingstone'),('ZM','Kabwe'),
  ('RW','Kigali'),('RW','Butare'),('RW','Gisenyi'),
  ('NG','Lagos'),('NG','Abuja'),('NG','Port Harcourt'),('NG','Ibadan'),
  ('GH','Accra'),('GH','Kumasi'),('GH','Takoradi'),
  ('ZA','Johannesburg'),('ZA','Cape Town'),('ZA','Durban'),('ZA','Pretoria')
ON CONFLICT (country_code, name) DO NOTHING;

ALTER TABLE public.influencers
  ADD COLUMN IF NOT EXISTS country_code text REFERENCES public.countries(code) ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.discovery_creators
  ADD COLUMN IF NOT EXISTS country_code text REFERENCES public.countries(code) ON UPDATE CASCADE;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS country_code text REFERENCES public.countries(code) ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_influencers_country ON public.influencers (country_code);
CREATE INDEX IF NOT EXISTS idx_influencers_city ON public.influencers (city);
CREATE INDEX IF NOT EXISTS idx_discovery_creators_country ON public.discovery_creators (country_code);
CREATE INDEX IF NOT EXISTS idx_discovery_creators_city ON public.discovery_creators (city);
CREATE INDEX IF NOT EXISTS idx_campaigns_country ON public.campaigns (country_code);
CREATE INDEX IF NOT EXISTS idx_cities_country ON public.cities (country_code);