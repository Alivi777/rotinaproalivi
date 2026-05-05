-- Tabela de metas mensais por setor (cada linha = um indicador)
CREATE TABLE public.sector_monthly_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid NOT NULL,
  period_month date NOT NULL, -- primeiro dia do mês
  label text NOT NULL,
  target_text text,            -- meta em texto livre (ex: "<7 min", "100%")
  target_value numeric,        -- meta numérica (quando aplicável)
  actual_value numeric,        -- valor realizado (manual)
  actual_text text,            -- valor realizado em texto (quando manual/qualitativo)
  unit text,                   -- "%", "min", "leads", "R$", etc
  auto_source text,            -- chave para cálculo automático (ex: "sales_count", "leads_total"), NULL = manual
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sector_id, period_month, label)
);

CREATE INDEX idx_sector_monthly_metrics_sector_period
  ON public.sector_monthly_metrics(sector_id, period_month);

ALTER TABLE public.sector_monthly_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sector metrics viewable by authenticated"
  ON public.sector_monthly_metrics FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins insert sector metrics"
  ON public.sector_monthly_metrics FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update sector metrics"
  ON public.sector_monthly_metrics FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete sector metrics"
  ON public.sector_monthly_metrics FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_sector_monthly_metrics_updated
  BEFORE UPDATE ON public.sector_monthly_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();