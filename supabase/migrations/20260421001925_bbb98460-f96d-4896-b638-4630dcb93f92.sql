
-- Tabela: client_task_items (checklist interno do card da Recepção)
CREATE TABLE IF NOT EXISTS public.client_task_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  daily_task_id uuid REFERENCES public.clinic_daily_tasks(id) ON DELETE SET NULL,
  task_type text NOT NULL,           -- birthday, confirm_d7..d4, protocol_d3, urgency_d2, unbook_confirm_d1, new_client_urgent
  task_label text NOT NULL,
  task_howto text,
  task_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | done
  note text,
  message_copy text,
  completed_at timestamptz,
  completed_by uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cti_client     ON public.client_task_items(client_id);
CREATE INDEX IF NOT EXISTS idx_cti_status     ON public.client_task_items(status);
CREATE INDEX IF NOT EXISTS idx_cti_task_date  ON public.client_task_items(task_date);
CREATE INDEX IF NOT EXISTS idx_cti_completed_by ON public.client_task_items(completed_by);

ALTER TABLE public.client_task_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Items viewable by authenticated" ON public.client_task_items;
CREATE POLICY "Items viewable by authenticated"
  ON public.client_task_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert items" ON public.client_task_items;
CREATE POLICY "Authenticated insert items"
  ON public.client_task_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated update items" ON public.client_task_items;
CREATE POLICY "Authenticated update items"
  ON public.client_task_items FOR UPDATE
  TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins delete items" ON public.client_task_items;
CREATE POLICY "Admins delete items"
  ON public.client_task_items FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_cti_updated_at ON public.client_task_items;
CREATE TRIGGER trg_cti_updated_at
  BEFORE UPDATE ON public.client_task_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
