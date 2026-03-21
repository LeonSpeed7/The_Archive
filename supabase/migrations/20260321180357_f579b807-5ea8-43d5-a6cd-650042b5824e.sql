
-- Make object_id nullable and add personal_object_id to stories
ALTER TABLE public.stories ALTER COLUMN object_id DROP NOT NULL;

ALTER TABLE public.stories ADD COLUMN personal_object_id uuid REFERENCES public.personal_objects(id) ON DELETE CASCADE;

-- Add check: exactly one of object_id or personal_object_id must be set
-- Using a trigger instead of CHECK for compatibility
CREATE OR REPLACE FUNCTION public.validate_story_target()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.object_id IS NULL AND NEW.personal_object_id IS NULL) OR
     (NEW.object_id IS NOT NULL AND NEW.personal_object_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of object_id or personal_object_id must be set';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_story_target_trigger
BEFORE INSERT OR UPDATE ON public.stories
FOR EACH ROW EXECUTE FUNCTION public.validate_story_target();

-- Update the can_view_story function to also work for personal object stories
-- (personal object stories follow same visibility rules)

-- Update RLS select policy to also handle personal_object_id stories
DROP POLICY "Users can view stories based on visibility" ON public.stories;
CREATE POLICY "Users can view stories based on visibility"
ON public.stories FOR SELECT TO authenticated
USING (
  can_view_story(user_id, visibility)
);
