
-- Create personal_objects table (private per user)
CREATE TABLE public.personal_objects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  history TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own personal objects"
ON public.personal_objects FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own personal objects"
ON public.personal_objects FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personal objects"
ON public.personal_objects FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own personal objects"
ON public.personal_objects FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_personal_objects_updated_at
BEFORE UPDATE ON public.personal_objects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();
