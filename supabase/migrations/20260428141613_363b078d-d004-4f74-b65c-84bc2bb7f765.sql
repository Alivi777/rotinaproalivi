
-- 1) Sales: scope UPDATE to owner or admin
DROP POLICY IF EXISTS "Authenticated update sales" ON public.sales;
CREATE POLICY "Owner or admin update sales"
  ON public.sales FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

-- 2) Contacts: tighten SELECT - require sector match (no NULL fallback) or admin
DROP POLICY IF EXISTS "Contacts viewable by sector or admin" ON public.contacts;
CREATE POLICY "Contacts viewable by sector or admin"
  ON public.contacts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      sector_id IS NOT NULL
      AND sector_id IN (SELECT sector_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- 3) team_feedbacks: allow manager who authored to view
DROP POLICY IF EXISTS "Users view own feedbacks" ON public.team_feedbacks;
CREATE POLICY "Users or managers view feedbacks"
  ON public.team_feedbacks FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = manager_id
    OR public.has_role(auth.uid(), 'admin')
  );

-- 4) user_roles: restrict SELECT to own row or admin
DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "Users view own role or admin"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
