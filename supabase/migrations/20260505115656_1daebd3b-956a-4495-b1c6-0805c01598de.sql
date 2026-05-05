ALTER TABLE public.sector_monthly_metrics ALTER COLUMN sector_id DROP NOT NULL;
-- recria índice único permitindo NULL
ALTER TABLE public.sector_monthly_metrics DROP CONSTRAINT IF EXISTS sector_monthly_metrics_sector_id_period_month_label_key;
CREATE UNIQUE INDEX IF NOT EXISTS sector_monthly_metrics_unique_idx
  ON public.sector_monthly_metrics (COALESCE(sector_id, '00000000-0000-0000-0000-000000000000'::uuid), period_month, label);