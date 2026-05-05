
-- Roles
CREATE TYPE public.app_role AS ENUM ('agency_admin', 'account_manager', 'client_viewer', 'influencer');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'pitched', 'won', 'live', 'reporting', 'closed');
CREATE TYPE public.post_status AS ENUM ('drafted', 'approved', 'live', 'completed');
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'changes_requested');
CREATE TYPE public.payout_status AS ENUM ('pending', 'processing', 'paid', 'failed');
CREATE TYPE public.platform AS ENUM ('tiktok','instagram','youtube','twitter','facebook');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by self" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'agency_admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'agency_admin')) WITH CHECK (public.has_role(auth.uid(),'agency_admin'));

-- Auto profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  -- First user becomes agency_admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role='agency_admin') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'agency_admin');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'account_manager');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Clients (brands)
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  logo_url TEXT,
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  country TEXT DEFAULT 'Kenya',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency reads clients" ON public.clients FOR SELECT USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));
CREATE POLICY "Agency writes clients" ON public.clients FOR ALL USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')) WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));

-- Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brief TEXT,
  objective TEXT,
  hashtag TEXT,
  start_date DATE,
  end_date DATE,
  budget_kes NUMERIC(14,2) DEFAULT 0,
  status campaign_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency reads campaigns" ON public.campaigns FOR SELECT USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));
CREATE POLICY "Agency writes campaigns" ON public.campaigns FOR ALL USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')) WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));

-- Influencers
CREATE TABLE public.influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  handle TEXT,
  primary_platform platform DEFAULT 'instagram',
  niche TEXT,
  region TEXT DEFAULT 'Kenya',
  languages TEXT[] DEFAULT ARRAY['English','Swahili'],
  follower_count INTEGER DEFAULT 0,
  engagement_rate NUMERIC(5,2) DEFAULT 0,
  avg_cpm_kes NUMERIC(10,2) DEFAULT 0,
  audience_kenya_pct NUMERIC(5,2) DEFAULT 80,
  authenticity_score NUMERIC(5,2) DEFAULT 80,
  avatar_url TEXT,
  phone_mpesa TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency reads influencers" ON public.influencers FOR SELECT USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));
CREATE POLICY "Agency writes influencers" ON public.influencers FOR ALL USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')) WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));

-- Campaign <-> Influencer
CREATE TABLE public.campaign_influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_id UUID NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  fee_kes NUMERIC(14,2) DEFAULT 0,
  deliverables_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'invited',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, influencer_id)
);
ALTER TABLE public.campaign_influencers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages campaign_influencers" ON public.campaign_influencers FOR ALL USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')) WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));

-- Posts
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_id UUID NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  platform platform NOT NULL DEFAULT 'instagram',
  post_url TEXT,
  caption TEXT,
  thumbnail_url TEXT,
  status post_status NOT NULL DEFAULT 'drafted',
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages posts" ON public.posts FOR ALL USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')) WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));

-- Post metrics snapshots
CREATE TABLE public.post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0
);
ALTER TABLE public.post_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages metrics" ON public.post_metrics FOR ALL USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')) WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));

-- Approvals
CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES auth.users(id),
  status approval_status NOT NULL DEFAULT 'pending',
  comment TEXT,
  round INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages approvals" ON public.approvals FOR ALL USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')) WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));

-- Payouts
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_id UUID NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  gross_kes NUMERIC(14,2) NOT NULL,
  wht_kes NUMERIC(14,2) DEFAULT 0,
  net_kes NUMERIC(14,2) NOT NULL,
  status payout_status NOT NULL DEFAULT 'pending',
  mpesa_ref TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages payouts" ON public.payouts FOR ALL USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')) WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));

-- Report links (public tokenized)
CREATE TABLE public.report_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.report_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages report_links" ON public.report_links FOR ALL USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')) WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));
-- Public can read active tokens (token itself acts as the secret; queried by token)
CREATE POLICY "Public reads active report links" ON public.report_links FOR SELECT USING (is_active = true);

-- Public read access for the report (scoped via campaign id from active token)
CREATE POLICY "Public reads campaigns via active link" ON public.campaigns FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.report_links rl WHERE rl.campaign_id = campaigns.id AND rl.is_active = true)
);
CREATE POLICY "Public reads clients via active link" ON public.clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.campaigns c JOIN public.report_links rl ON rl.campaign_id = c.id WHERE c.client_id = clients.id AND rl.is_active = true)
);
CREATE POLICY "Public reads posts via active link" ON public.posts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.report_links rl WHERE rl.campaign_id = posts.campaign_id AND rl.is_active = true)
);
CREATE POLICY "Public reads post_metrics via active link" ON public.post_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.posts p JOIN public.report_links rl ON rl.campaign_id = p.campaign_id WHERE p.id = post_metrics.post_id AND rl.is_active = true)
);
CREATE POLICY "Public reads ci via active link" ON public.campaign_influencers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.report_links rl WHERE rl.campaign_id = campaign_influencers.campaign_id AND rl.is_active = true)
);
CREATE POLICY "Public reads influencers via active link" ON public.influencers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.campaign_influencers ci JOIN public.report_links rl ON rl.campaign_id = ci.campaign_id WHERE ci.influencer_id = influencers.id AND rl.is_active = true)
);
