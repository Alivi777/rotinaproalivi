-- 1) Active flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Admins can update other profiles (sector, is_active, display_name)
CREATE POLICY "Admins update any profile"
ON public.profiles FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Helper: is the current user active?
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE user_id = _user_id),
    false
  );
$$;

-- 2) WhatsApp attendance sessions
CREATE TABLE public.whatsapp_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'auto'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_sessions_user_started ON public.whatsapp_sessions(user_id, started_at DESC);
CREATE INDEX idx_wa_sessions_started ON public.whatsapp_sessions(started_at DESC);

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "WA sessions viewable by authenticated"
ON public.whatsapp_sessions FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Users insert own WA sessions"
ON public.whatsapp_sessions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_user_active(auth.uid()));

CREATE POLICY "Users update own WA sessions"
ON public.whatsapp_sessions FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins manage WA sessions"
ON public.whatsapp_sessions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_wa_sessions_updated_at
BEFORE UPDATE ON public.whatsapp_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sessions;

-- 3) Aggregate minutes per user in a date range (SP timezone)
CREATE OR REPLACE FUNCTION public.whatsapp_user_minutes(
  _start_date date,
  _end_date date
)
RETURNS TABLE (
  user_id uuid,
  total_minutes numeric,
  session_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.user_id,
    COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at)) / 60.0), 0)::numeric AS total_minutes,
    COUNT(*) AS session_count
  FROM public.whatsapp_sessions s
  WHERE (s.started_at AT TIME ZONE 'America/Sao_Paulo')::date >= _start_date
    AND (s.started_at AT TIME ZONE 'America/Sao_Paulo')::date <= _end_date
  GROUP BY s.user_id;
$$;