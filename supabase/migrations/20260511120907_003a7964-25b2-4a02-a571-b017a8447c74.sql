
CREATE POLICY "Recepcao clients viewable by all authenticated"
ON public.clients
FOR SELECT
TO authenticated
USING (
  sector_id = '4af641d9-3b76-48f1-a70c-c0d856f05d4e'::uuid
);

CREATE POLICY "Recepcao task items viewable by all authenticated"
ON public.client_task_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_task_items.client_id
      AND c.sector_id = '4af641d9-3b76-48f1-a70c-c0d856f05d4e'::uuid
  )
);
