CREATE OR REPLACE FUNCTION public.user_participates_in_daily_plan(_user_id uuid, _plan_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.manager_daily_assignments
     WHERE daily_plan_id = _plan_id AND assignee_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "Daily plans viewable by manager/assignee or admin" ON public.manager_daily_plans;
CREATE POLICY "Daily plans viewable by manager/assignee or admin"
ON public.manager_daily_plans FOR SELECT TO authenticated
USING (
  auth.uid() = manager_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR public.user_participates_in_daily_plan(auth.uid(), id)
);

CREATE OR REPLACE FUNCTION public.user_owns_daily_plan(_user_id uuid, _plan_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.manager_daily_plans
     WHERE id = _plan_id AND manager_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "Assignments viewable by participant or admin" ON public.manager_daily_assignments;
CREATE POLICY "Assignments viewable by participant or admin"
ON public.manager_daily_assignments FOR SELECT TO authenticated
USING (
  auth.uid() = assignee_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR public.user_owns_daily_plan(auth.uid(), daily_plan_id)
);

DROP POLICY IF EXISTS "Deliverables viewable by responsible or admin" ON public.daily_plan_deliverables;
CREATE POLICY "Deliverables viewable by responsible or admin"
ON public.daily_plan_deliverables FOR SELECT TO authenticated
USING (
  auth.uid() = responsible_user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR public.user_owns_daily_plan(auth.uid(), daily_plan_id)
);

DROP POLICY IF EXISTS "Responsible or admin update deliverables" ON public.daily_plan_deliverables;
CREATE POLICY "Responsible or admin update deliverables"
ON public.daily_plan_deliverables FOR UPDATE TO authenticated
USING (
  auth.uid() = responsible_user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR public.user_owns_daily_plan(auth.uid(), daily_plan_id)
);