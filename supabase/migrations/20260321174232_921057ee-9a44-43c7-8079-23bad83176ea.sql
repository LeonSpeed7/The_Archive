
-- Add username column to profiles (unique, required for new signups)
ALTER TABLE public.profiles ADD COLUMN username TEXT UNIQUE;

-- Add full_name column for required full name
ALTER TABLE public.profiles ADD COLUMN full_name TEXT;

-- Create index for username lookups
CREATE INDEX idx_profiles_username ON public.profiles (username);

-- Update connect_by_safeword to also accept username-based connection
-- Drop existing overloaded functions first
DROP FUNCTION IF EXISTS public.connect_by_safeword(text);
DROP FUNCTION IF EXISTS public.connect_by_safeword(text, text);

-- Recreate with username lookup: p_username is the target's username, p_safeword is their safeword for auth
CREATE OR REPLACE FUNCTION public.connect_by_safeword(p_safeword text, p_username text DEFAULT ''::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target_id UUID;
BEGIN
  -- Find user by username if provided, otherwise by safeword alone
  IF p_username IS NOT NULL AND TRIM(p_username) != '' THEN
    SELECT user_id INTO v_target_id FROM public.profiles 
    WHERE username = LOWER(TRIM(p_username)) AND safeword = p_safeword;
  ELSE
    SELECT user_id INTO v_target_id FROM public.profiles WHERE safeword = p_safeword;
  END IF;
  
  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Invalid username or safeword';
  END IF;
  IF v_target_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot connect to yourself';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.family_connections
    WHERE (requester_id = auth.uid() AND target_id = v_target_id)
       OR (requester_id = v_target_id AND target_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Already connected';
  END IF;
  INSERT INTO public.family_connections (requester_id, target_id, nickname) 
  VALUES (auth.uid(), v_target_id, '');
  RETURN v_target_id;
END;
$$;
