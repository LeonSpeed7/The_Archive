
ALTER TABLE public.family_connections ADD COLUMN nickname TEXT NOT NULL DEFAULT '';

-- Update the connect function to accept a nickname
CREATE OR REPLACE FUNCTION public.connect_by_safeword(p_safeword TEXT, p_nickname TEXT DEFAULT '')
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
  IF EXISTS (
    SELECT 1 FROM public.family_connections
    WHERE (requester_id = auth.uid() AND target_id = v_target_id)
       OR (requester_id = v_target_id AND target_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Already connected';
  END IF;
  INSERT INTO public.family_connections (requester_id, target_id, nickname) VALUES (auth.uid(), v_target_id, COALESCE(NULLIF(TRIM(p_nickname), ''), 'Family Member'));
  RETURN v_target_id;
END;
$$;
