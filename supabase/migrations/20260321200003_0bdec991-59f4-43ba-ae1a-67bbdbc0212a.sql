-- Allow creators to delete their own objects
CREATE POLICY "Creators can delete own objects"
ON public.objects
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);