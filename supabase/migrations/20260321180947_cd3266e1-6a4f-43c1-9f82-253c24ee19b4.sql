
-- Allow authenticated users to SELECT profiles (needed to display story author names)
-- Drop the existing restrictive policy
DROP POLICY "Users can view own profile" ON public.profiles;

-- Allow all authenticated users to read profiles
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles FOR SELECT TO authenticated
USING (true);

-- Add UPDATE policy for stories so users can edit their own
CREATE POLICY "Users can update own stories"
ON public.stories FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
