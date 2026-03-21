
ALTER TABLE public.personal_objects 
ADD COLUMN visibility text NOT NULL DEFAULT 'family';

-- Add a comment for clarity
COMMENT ON COLUMN public.personal_objects.visibility IS 'Visibility level: family (visible to family connections) or public (visible to everyone)';
