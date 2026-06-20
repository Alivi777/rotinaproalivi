
-- 1) Prevent self-reactivation: only admins can flip is_active on profiles
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.is_active := OLD.is_active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- Also add a WITH CHECK to the self-update policy
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2) clients DELETE: admin or creator only
DROP POLICY IF EXISTS "Authenticated can delete clients" ON public.clients;
CREATE POLICY "Owner or admin delete clients" ON public.clients
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = created_by
);

-- 3) clients INSERT/UPDATE: require active user
DROP POLICY IF EXISTS "Authenticated can insert clients" ON public.clients;
CREATE POLICY "Active users insert clients" ON public.clients
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND public.is_user_active(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can update clients" ON public.clients;
CREATE POLICY "Active users update clients" ON public.clients
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL AND public.is_user_active(auth.uid()))
WITH CHECK (auth.uid() IS NOT NULL AND public.is_user_active(auth.uid()));

-- 4) client_task_items: restrict mutations to client owners + active
DROP POLICY IF EXISTS "Authenticated insert items" ON public.client_task_items;
CREATE POLICY "Client owners insert items" ON public.client_task_items
FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_task_items.client_id
        AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid()
             OR c.sector_id = '4af641d9-3b76-48f1-a70c-c0d856f05d4e'::uuid)
    )
  )
);

DROP POLICY IF EXISTS "Authenticated update items" ON public.client_task_items;
CREATE POLICY "Client owners update items" ON public.client_task_items
FOR UPDATE TO authenticated
USING (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = completed_by
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_task_items.client_id
        AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid()
             OR c.sector_id = '4af641d9-3b76-48f1-a70c-c0d856f05d4e'::uuid)
    )
  )
)
WITH CHECK (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = completed_by
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_task_items.client_id
        AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid()
             OR c.sector_id = '4af641d9-3b76-48f1-a70c-c0d856f05d4e'::uuid)
    )
  )
);

-- 5) client_notes: require active user for inserts
DROP POLICY IF EXISTS "Authenticated insert notes" ON public.client_notes;
CREATE POLICY "Active authors insert notes" ON public.client_notes
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = author_id AND public.is_user_active(auth.uid()));

-- 6) client_tasks: require active user for inserts and updates
DROP POLICY IF EXISTS "Authenticated insert client tasks" ON public.client_tasks;
CREATE POLICY "Active users insert client tasks" ON public.client_tasks
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND public.is_user_active(auth.uid()));

DROP POLICY IF EXISTS "Assignee or admin update client tasks" ON public.client_tasks;
CREATE POLICY "Assignee or admin update client tasks" ON public.client_tasks
FOR UPDATE TO authenticated
USING (
  public.is_user_active(auth.uid())
  AND (auth.uid() = assigned_to OR public.has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  public.is_user_active(auth.uid())
  AND (auth.uid() = assigned_to OR public.has_role(auth.uid(), 'admin'::app_role))
);

-- 7) sales: require active user for inserts and updates
DROP POLICY IF EXISTS "Authenticated insert sales" ON public.sales;
CREATE POLICY "Active users insert sales" ON public.sales
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND public.is_user_active(auth.uid()));

DROP POLICY IF EXISTS "Owner or admin update sales" ON public.sales;
CREATE POLICY "Owner or admin update sales" ON public.sales
FOR UPDATE TO authenticated
USING (
  public.is_user_active(auth.uid())
  AND (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  public.is_user_active(auth.uid())
  AND (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role))
);

-- 8) time_clock_entries: require active user for self-punches and updates
DROP POLICY IF EXISTS "Users insert own entries" ON public.time_clock_entries;
CREATE POLICY "Active users insert own entries" ON public.time_clock_entries
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_user_active(auth.uid()));

DROP POLICY IF EXISTS "Owners punch own entries" ON public.time_clock_entries;
CREATE POLICY "Active owners punch own entries" ON public.time_clock_entries
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND public.is_user_active(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_user_active(auth.uid()));

-- 9) clinic_daily_tasks: require active user when assignee updates
DROP POLICY IF EXISTS "Assignee or admin updates tasks" ON public.clinic_daily_tasks;
CREATE POLICY "Active assignee or admin updates tasks" ON public.clinic_daily_tasks
FOR UPDATE TO authenticated
USING (
  public.is_user_active(auth.uid())
  AND (auth.uid() = assigned_to OR public.has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  public.is_user_active(auth.uid())
  AND (auth.uid() = assigned_to OR public.has_role(auth.uid(), 'admin'::app_role))
);

-- 10) daily_priorities: require active user for owner updates
DROP POLICY IF EXISTS "Owners update own priority status" ON public.daily_priorities;
CREATE POLICY "Active owners update own priority status" ON public.daily_priorities
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND public.is_user_active(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_user_active(auth.uid()));

-- 11) whatsapp_messages: require active user for inserts
DROP POLICY IF EXISTS "Authenticated can insert messages" ON public.whatsapp_messages;
CREATE POLICY "Active users insert messages" ON public.whatsapp_messages
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND public.is_user_active(auth.uid()));
