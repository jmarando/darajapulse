
-- 1. Add client_user role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'client_user';
