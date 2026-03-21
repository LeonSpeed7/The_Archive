
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text DEFAULT NULL;

ALTER TABLE public.family_connections ADD COLUMN IF NOT EXISTS note text DEFAULT '' NOT NULL;

-- Allow users to update their own connections (needed for editing note)
CREATE POLICY "Users can update own connections"
  ON public.family_connections FOR UPDATE
  TO authenticated
  USING ((auth.uid() = requester_id) OR (auth.uid() = target_id))
  WITH CHECK ((auth.uid() = requester_id) OR (auth.uid() = target_id));
