
CREATE OR REPLACE FUNCTION public.get_personal_object_if_allowed(p_object_id uuid)
RETURNS SETOF personal_objects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT po.* FROM public.personal_objects po
  WHERE po.id = p_object_id
    AND (
      po.user_id = auth.uid()
      OR po.user_id IN (
        SELECT CASE WHEN fc.requester_id = auth.uid() THEN fc.target_id ELSE fc.requester_id END
        FROM public.family_connections fc
        WHERE fc.requester_id = auth.uid() OR fc.target_id = auth.uid()
      )
    )
  LIMIT 1;
$$;
