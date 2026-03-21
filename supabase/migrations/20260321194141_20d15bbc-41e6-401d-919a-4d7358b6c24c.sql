
-- Add relationship column to family_connections
ALTER TABLE public.family_connections 
ADD COLUMN relationship text NOT NULL DEFAULT 'other';

-- Update connect_by_safeword to accept relationship
CREATE OR REPLACE FUNCTION public.connect_by_safeword(p_safeword text, p_username text DEFAULT ''::text, p_relationship text DEFAULT 'other'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_id UUID;
BEGIN
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
  INSERT INTO public.family_connections (requester_id, target_id, nickname, relationship) 
  VALUES (auth.uid(), v_target_id, '', COALESCE(p_relationship, 'other'));
  RETURN v_target_id;
END;
$function$;
