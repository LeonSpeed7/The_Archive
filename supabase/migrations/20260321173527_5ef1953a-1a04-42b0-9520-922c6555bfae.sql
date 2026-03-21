
-- Add estimated_origin column to both object tables
ALTER TABLE public.objects ADD COLUMN estimated_origin TEXT;
ALTER TABLE public.personal_objects ADD COLUMN estimated_origin TEXT;
