
-- Add visibility column to stories: 'global' (anyone) or 'family' (only author + family connections)
ALTER TABLE public.stories ADD COLUMN visibility TEXT NOT NULL DEFAULT 'global';

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Anyone authenticated can view stories" ON public.stories;

-- Create a function to check if viewer can see a story based on visibility
CREATE OR REPLACE FUNCTION public.can_view_story(story_user_id uuid, story_visibility text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      -- Author can always see their own stories
      WHEN story_user_id = auth.uid() THEN true
      -- Global stories are visible to everyone
      WHEN story_visibility = 'global' THEN true
      -- Family stories are visible to connected family members
      WHEN story_visibility = 'family' THEN EXISTS (
        SELECT 1 FROM public.family_connections fc
        WHERE (fc.requester_id = auth.uid() AND fc.target_id = story_user_id)
           OR (fc.target_id = auth.uid() AND fc.requester_id = story_user_id)
      )
      ELSE false
    END;
$$;

-- New SELECT policy using the security definer function
CREATE POLICY "Users can view stories based on visibility"
ON public.stories
FOR SELECT
TO authenticated
USING (public.can_view_story(user_id, visibility));
