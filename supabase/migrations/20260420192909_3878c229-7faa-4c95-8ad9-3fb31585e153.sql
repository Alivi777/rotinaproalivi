DROP POLICY IF EXISTS "Authenticated can insert messages" ON public.whatsapp_messages;
CREATE POLICY "Authenticated can insert messages" ON public.whatsapp_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);