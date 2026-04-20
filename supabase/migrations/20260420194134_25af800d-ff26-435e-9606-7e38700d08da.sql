-- Sectors
CREATE TABLE public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sectors viewable by authenticated" ON public.sectors
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.sectors (slug, name, icon, color, sort_order) VALUES
  ('recepcao', 'Recepção', 'DoorOpen', '175 84% 48%', 1),
  ('auditoria', 'Auditoria & Experiência', 'Sparkles', '280 75% 60%', 2),
  ('financeiro', 'Financeiro', 'Wallet', '142 70% 48%', 3),
  ('sucesso', 'Sucesso do Cliente', 'HeartHandshake', '38 92% 55%', 4),
  ('comercial', 'Gestão Comercial', 'TrendingUp', '0 75% 60%', 5),
  ('avaliador', 'Avaliador / Closer', 'Target', '210 90% 60%', 6),
  ('clinica', 'Direção Clínica', 'Stethoscope', '188 90% 50%', 7);

-- Add sector to profiles
ALTER TABLE public.profiles ADD COLUMN sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL;

-- Add sector to routine_tasks
ALTER TABLE public.routine_tasks ADD COLUMN sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE;
ALTER TABLE public.routine_tasks ADD COLUMN frequency TEXT DEFAULT 'daily';

-- Wipe seed tasks (no sector); we'll re-seed
DELETE FROM public.routine_tasks;

-- Daily reports (one per user per sector per day)
CREATE TABLE public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sector_id, report_date)
);
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports viewable by authenticated" ON public.daily_reports
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own reports" ON public.daily_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own reports" ON public.daily_reports
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own reports" ON public.daily_reports
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Google Calendar tokens (per user)
CREATE TABLE public.google_calendar_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own google tokens" ON public.google_calendar_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own google tokens" ON public.google_calendar_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own google tokens" ON public.google_calendar_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own google tokens" ON public.google_calendar_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_google_tokens_updated BEFORE UPDATE ON public.google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_reports_date ON public.daily_reports(report_date);
CREATE INDEX idx_tasks_sector ON public.routine_tasks(sector_id);
CREATE INDEX idx_profiles_sector ON public.profiles(sector_id);