-- 1) Restringir SELECT em daily_reports ao dono ou admin
DROP POLICY IF EXISTS "Reports viewable by authenticated" ON public.daily_reports;

CREATE POLICY "Reports viewable by owner or admin"
ON public.daily_reports
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 2) Campos de check nos entregáveis do plano do gestor
ALTER TABLE public.daily_plan_deliverables
  ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS done_at timestamptz,
  ADD COLUMN IF NOT EXISTS done_by uuid;

-- 3) Permitir UPDATE pelo responsável ou admin (admin já cobre via policy ALL existente)
DROP POLICY IF EXISTS "Responsible or admin update deliverables" ON public.daily_plan_deliverables;

CREATE POLICY "Responsible or admin update deliverables"
ON public.daily_plan_deliverables
FOR UPDATE
TO authenticated
USING (
  auth.uid() = responsible_user_id
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.manager_daily_plans p
    WHERE p.id = daily_plan_deliverables.daily_plan_id
      AND p.manager_id = auth.uid()
  )
);