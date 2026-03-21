
-- Add safeword column to profiles
ALTER TABLE public.profiles ADD COLUMN safeword TEXT UNIQUE;

-- Create family_connections table
CREATE TABLE public.family_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL,
  target_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (requester_id, target_id)
);

ALTER TABLE public.family_connections ENABLE ROW LEVEL SECURITY;

-- Users can see connections they're part of
CREATE POLICY "Users can view own connections"
ON public.family_connections FOR SELECT
TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- Users can create connections (as requester)
CREATE POLICY "Users can create connections"
ON public.family_connections FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = requester_id);

-- Users can delete connections they're part of
CREATE POLICY "Users can delete own connections"
ON public.family_connections FOR DELETE
TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- Create a security definer function to look up user by safeword (so we don't expose profiles)
CREATE OR REPLACE FUNCTION public.connect_by_safeword(p_safeword TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID;
BEGIN
  SELECT user_id INTO v_target_id FROM public.profiles WHERE safeword = p_safeword;
  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Invalid safeword';
  END IF;
  IF v_target_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot connect to yourself';
  END IF;
  -- Check if connection already exists in either direction
  IF EXISTS (
    SELECT 1 FROM public.family_connections
    WHERE (requester_id = auth.uid() AND target_id = v_target_id)
       OR (requester_id = v_target_id AND target_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Already connected';
  END IF;
  -- Create connection
  INSERT INTO public.family_connections (requester_id, target_id) VALUES (auth.uid(), v_target_id);
  RETURN v_target_id;
END;
$$;

-- Create a security definer function to get connected users' personal objects for search
-- This avoids needing permissive RLS on personal_objects for other users
CREATE OR REPLACE FUNCTION public.search_connected_personal_objects(p_search TEXT DEFAULT '')
RETURNS SETOF public.personal_objects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT po.* FROM public.personal_objects po
  WHERE po.user_id IN (
    SELECT CASE WHEN fc.requester_id = auth.uid() THEN fc.target_id ELSE fc.requester_id END
    FROM public.family_connections fc
    WHERE fc.requester_id = auth.uid() OR fc.target_id = auth.uid()
  )
  AND (p_search = '' OR po.name ILIKE '%' || p_search || '%')
  ORDER BY po.created_at DESC
  LIMIT 20;
$$;
