
DROP POLICY IF EXISTS "Contacts viewable by sector or admin" ON public.contacts;

CREATE POLICY "Contacts viewable by authenticated"
ON public.contacts
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);
