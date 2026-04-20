
-- ============================================
-- KANBAN STAGES (per sector, customizable)
-- ============================================
CREATE TABLE public.kanban_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kanban_stages_sector ON public.kanban_stages(sector_id, sort_order);

ALTER TABLE public.kanban_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stages viewable by authenticated"
  ON public.kanban_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage stages"
  ON public.kanban_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_kanban_stages_updated_at
  BEFORE UPDATE ON public.kanban_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- CLIENTS: add stage + assigned_to
-- ============================================
ALTER TABLE public.clients
  ADD COLUMN stage_id UUID REFERENCES public.kanban_stages(id) ON DELETE SET NULL,
  ADD COLUMN assigned_to UUID,
  ADD COLUMN sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  ADD COLUMN board_position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_clients_stage ON public.clients(stage_id);
CREATE INDEX idx_clients_assigned ON public.clients(assigned_to);

-- ============================================
-- CLIENT TASKS (also surfaced in routine of assignee on due_date)
-- ============================================
CREATE TABLE public.client_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL,
  created_by UUID,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_tasks_assignee_date ON public.client_tasks(assigned_to, due_date);
CREATE INDEX idx_client_tasks_client ON public.client_tasks(client_id);

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client tasks viewable by authenticated"
  ON public.client_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert client tasks"
  ON public.client_tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Assignee or admin update client tasks"
  ON public.client_tasks FOR UPDATE TO authenticated
  USING (auth.uid() = assigned_to OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete client tasks"
  ON public.client_tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = created_by);

CREATE TRIGGER update_client_tasks_updated_at
  BEFORE UPDATE ON public.client_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- CLIENT NOTES (timeline with auto timestamp)
-- ============================================
CREATE TABLE public.client_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_notes_client ON public.client_notes(client_id, created_at DESC);

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notes viewable by authenticated"
  ON public.client_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert notes"
  ON public.client_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors delete own notes"
  ON public.client_notes FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));

-- ============================================
-- DEFAULT STAGES (global template, sector_id = NULL)
-- ============================================
INSERT INTO public.kanban_stages (sector_id, name, slug, color, sort_order, is_won, is_lost) VALUES
  (NULL, 'Novo atendimento', 'novo', 'hsl(217 91% 60%)', 1, false, false),
  (NULL, 'Etapa 2', 'etapa-2', 'hsl(38 92% 50%)', 2, false, false),
  (NULL, 'Etapa 3', 'etapa-3', 'hsl(280 65% 60%)', 3, false, false),
  (NULL, 'Fechado', 'fechado', 'hsl(142 71% 45%)', 4, true, false),
  (NULL, 'Perdido', 'perdido', 'hsl(0 72% 51%)', 5, false, true);
