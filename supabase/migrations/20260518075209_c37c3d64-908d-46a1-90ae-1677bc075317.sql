-- Table for Facebook/Instagram data-deletion requests
CREATE TABLE public.data_deletion_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    platform_user_id TEXT,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can create a request (public form)
CREATE POLICY "Anyone can submit a deletion request"
ON public.data_deletion_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can view/manage requests
CREATE POLICY "Admins can view all deletion requests"
ON public.data_deletion_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'));

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_data_deletion_requests_updated_at
BEFORE UPDATE ON public.data_deletion_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();