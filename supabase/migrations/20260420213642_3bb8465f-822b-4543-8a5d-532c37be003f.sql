-- Manager weekly plans (Ritual semanal)
CREATE TABLE public.manager_weekly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  week_start date NOT NULL,
  method text NOT NULL DEFAULT 'tatico',
  -- Revisão da semana anterior
  prev_what_worked text,
  prev_time_wasters text,
  prev_excess_alignment text,
  prev_excess_execution text,
  prev_repeated_block text,
  prev_single_correction text,
  -- Definição da nova semana
  week_focus text,
  fixed_commitments text,
  not_this_week text,
  mission_blocks text,
  secondary_blocks text,
  -- Indicadores
  ind_alignments_done integer DEFAULT 0,
  ind_meetings_under_31 integer DEFAULT 0,
  ind_missions_done integer DEFAULT 0,
  ind_blocks_protected integer DEFAULT 0,
  ind_tasks_delegated integer DEFAULT 0,
  ind_tasks_eliminated integer DEFAULT 0,
  ind_days_tomorrow_defined integer DEFAULT 0,
  ind_interruptions integer DEFAULT 0,
  classification text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_id, week_start)
);

ALTER TABLE public.manager_weekly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Weekly plans viewable by authenticated"
  ON public.manager_weekly_plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage weekly plans"
  ON public.manager_weekly_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_manager_weekly_plans_updated_at
  BEFORE UPDATE ON public.manager_weekly_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Manager daily plans (Ata da reunião + plano do dia)
CREATE TABLE public.manager_daily_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  plan_date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'tatico',
  -- Dados da reunião
  meeting_start time,
  meeting_end time,
  meeting_duration_min integer,
  conducted_by text,
  participant_1 text,
  participant_2 text,
  participant_3 text,
  -- Revisão de ontem
  yesterday_main_mission text,
  yesterday_status text, -- concluida | parcial | nao_concluida
  yesterday_advanced text,
  yesterday_blocked text,
  yesterday_pending text,
  -- Cenário do dia
  today_fixed text,
  today_urgencies text,
  today_bottlenecks text,
  today_main_risk text,
  -- Definição do dia (do gestor)
  main_mission text,
  secondary_1 text,
  secondary_2 text,
  -- Proteção da execução
  to_block text,
  to_delegate text,
  not_today text,
  needs_support text,
  pending_next text,
  -- Checklists (json arrays of booleans)
  opening_checklist jsonb DEFAULT '{}'::jsonb,
  during_checklist jsonb DEFAULT '{}'::jsonb,
  closing_checklist jsonb DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_id, plan_date)
);

ALTER TABLE public.manager_daily_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Daily plans viewable by authenticated"
  ON public.manager_daily_plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage daily plans"
  ON public.manager_daily_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_manager_daily_plans_updated_at
  BEFORE UPDATE ON public.manager_daily_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Daily plan deliverables (Donos, prazos)
CREATE TABLE public.daily_plan_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_plan_id uuid NOT NULL REFERENCES public.manager_daily_plans(id) ON DELETE CASCADE,
  title text NOT NULL,
  responsible text,
  responsible_user_id uuid,
  due_date date,
  status text NOT NULL DEFAULT 'pending',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_plan_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deliverables viewable by authenticated"
  ON public.daily_plan_deliverables FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage deliverables"
  ON public.daily_plan_deliverables FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Daily assignments (3 prioridades por pessoa do time, atribuídas pelo gestor)
CREATE TABLE public.manager_daily_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_plan_id uuid NOT NULL REFERENCES public.manager_daily_plans(id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL,
  main_mission text NOT NULL,
  secondary_1 text,
  secondary_2 text,
  observation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (daily_plan_id, assignee_id)
);

ALTER TABLE public.manager_daily_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments viewable by authenticated"
  ON public.manager_daily_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage assignments"
  ON public.manager_daily_assignments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_manager_daily_assignments_updated_at
  BEFORE UPDATE ON public.manager_daily_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_daily_plans_manager_date ON public.manager_daily_plans(manager_id, plan_date DESC);
CREATE INDEX idx_weekly_plans_manager_week ON public.manager_weekly_plans(manager_id, week_start DESC);
CREATE INDEX idx_assignments_plan ON public.manager_daily_assignments(daily_plan_id);
CREATE INDEX idx_assignments_assignee ON public.manager_daily_assignments(assignee_id);
CREATE INDEX idx_deliverables_plan ON public.daily_plan_deliverables(daily_plan_id);