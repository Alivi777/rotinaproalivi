
-- Tabela de logs de auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_email text,
  user_name text,
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[]
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON public.audit_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs (table_name);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ler
CREATE POLICY "Admins view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Inserts são feitos pelos triggers (security definer); ainda assim travamos client-side
CREATE POLICY "Admins insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Função genérica de trigger
CREATE OR REPLACE FUNCTION public.log_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_name text;
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_record_id text;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT display_name, email INTO v_name, v_email
      FROM public.profiles WHERE user_id = v_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(v_new->>'id', '');
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(v_new->>'id', v_old->>'id', '');
    SELECT array_agg(key) INTO v_changed
      FROM jsonb_each(v_new)
      WHERE v_new->key IS DISTINCT FROM v_old->key
        AND key NOT IN ('updated_at');
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_record_id := COALESCE(v_old->>'id', '');
  END IF;

  -- Não loga se for UPDATE somente em updated_at
  IF TG_OP = 'UPDATE' AND (v_changed IS NULL OR array_length(v_changed,1) IS NULL) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.audit_logs (
    user_id, user_email, user_name, table_name, record_id, action,
    old_data, new_data, changed_fields
  ) VALUES (
    v_user_id, v_email, v_name, TG_TABLE_NAME, v_record_id, TG_OP,
    v_old, v_new, v_changed
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Anexa triggers nas tabelas chave
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','contacts','sales','routine_tasks','profiles',
    'clinic_appointments','clinic_doctors','daily_priorities',
    'manager_daily_plans','team_feedbacks','client_tasks','client_task_items',
    'kanban_stages','monthly_goals','sector_monthly_metrics','clinic_daily_tasks',
    'time_clock_correction_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_table_change()',
      t, t
    );
  END LOOP;
END$$;
