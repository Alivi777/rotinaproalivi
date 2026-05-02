-- =========================================================
-- Helper function: check if user is owner of a clinic doctor
-- =========================================================
CREATE OR REPLACE FUNCTION public.user_owns_doctor(_user_id uuid, _doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_doctors
    WHERE id = _doctor_id AND assigned_user_id = _user_id
  );
$$;

-- =========================================================
-- daily_priorities: owner or manager
-- =========================================================
DROP POLICY IF EXISTS "Priorities viewable by authenticated" ON public.daily_priorities;
CREATE POLICY "Priorities viewable by owner or manager"
ON public.daily_priorities FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() = manager_id
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- =========================================================
-- priority_messages: only participants of the priority
-- =========================================================
DROP POLICY IF EXISTS "Priority messages viewable by authenticated" ON public.priority_messages;
CREATE POLICY "Priority messages viewable by participants"
ON public.priority_messages FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.daily_priorities dp
    WHERE dp.id = priority_messages.priority_id
      AND (dp.user_id = auth.uid() OR dp.manager_id = auth.uid())
  )
);

-- =========================================================
-- clients: assigned_to or created_by
-- =========================================================
DROP POLICY IF EXISTS "Clients viewable by authenticated" ON public.clients;
CREATE POLICY "Clients viewable by owner or admin"
ON public.clients FOR SELECT
TO authenticated
USING (
  auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- =========================================================
-- client_tasks: assigned_to / created_by / completed_by
-- =========================================================
DROP POLICY IF EXISTS "Client tasks viewable by authenticated" ON public.client_tasks;
CREATE POLICY "Client tasks viewable by participants"
ON public.client_tasks FOR SELECT
TO authenticated
USING (
  auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR auth.uid() = completed_by
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- =========================================================
-- client_task_items: linked via client (assigned/created)
-- =========================================================
DROP POLICY IF EXISTS "Items viewable by authenticated" ON public.client_task_items;
CREATE POLICY "Task items viewable by participants"
ON public.client_task_items FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = completed_by
  OR EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_task_items.client_id
      AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid())
  )
);

-- =========================================================
-- client_notes: only author
-- =========================================================
DROP POLICY IF EXISTS "Notes viewable by authenticated" ON public.client_notes;
CREATE POLICY "Notes viewable by author or admin"
ON public.client_notes FOR SELECT
TO authenticated
USING (
  auth.uid() = author_id
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- =========================================================
-- clinic_doctors: only assigned user
-- =========================================================
DROP POLICY IF EXISTS "Doctors viewable by authenticated" ON public.clinic_doctors;
CREATE POLICY "Doctors viewable by owner or admin"
ON public.clinic_doctors FOR SELECT
TO authenticated
USING (
  auth.uid() = assigned_user_id
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- =========================================================
-- clinic_appointments: doctor assigned to user
-- =========================================================
DROP POLICY IF EXISTS "Appointments viewable by authenticated" ON public.clinic_appointments;
CREATE POLICY "Appointments viewable by doctor owner or admin"
ON public.clinic_appointments FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (doctor_id IS NOT NULL AND public.user_owns_doctor(auth.uid(), doctor_id))
);

-- =========================================================
-- WhatsApp: pending, messages, sessions
-- =========================================================
DROP POLICY IF EXISTS "Pending viewable by authenticated" ON public.whatsapp_pending_attendances;
CREATE POLICY "Pending viewable by assignee or admin"
ON public.whatsapp_pending_attendances FOR SELECT
TO authenticated
USING (
  auth.uid() = assigned_to
  OR has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Messages viewable by authenticated" ON public.whatsapp_messages;
CREATE POLICY "WA messages viewable by attendance assignee or admin"
ON public.whatsapp_messages FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.whatsapp_pending_attendances pa
    WHERE pa.from_phone = whatsapp_messages.from_phone
      AND pa.assigned_to = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = whatsapp_messages.client_id
      AND c.assigned_to = auth.uid()
  )
);

DROP POLICY IF EXISTS "Sessions viewable by authenticated" ON public.whatsapp_sessions;
CREATE POLICY "WA sessions viewable by owner or admin"
ON public.whatsapp_sessions FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- =========================================================
-- Manager plans / assignments / deliverables
-- =========================================================
DROP POLICY IF EXISTS "Daily plans viewable by authenticated" ON public.manager_daily_plans;
CREATE POLICY "Daily plans viewable by manager/assignee or admin"
ON public.manager_daily_plans FOR SELECT
TO authenticated
USING (
  auth.uid() = manager_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.manager_daily_assignments a
    WHERE a.daily_plan_id = manager_daily_plans.id
      AND a.assignee_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Assignments viewable by authenticated" ON public.manager_daily_assignments;
CREATE POLICY "Assignments viewable by participant or admin"
ON public.manager_daily_assignments FOR SELECT
TO authenticated
USING (
  auth.uid() = assignee_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.manager_daily_plans p
    WHERE p.id = manager_daily_assignments.daily_plan_id
      AND p.manager_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Weekly plans viewable by authenticated" ON public.manager_weekly_plans;
CREATE POLICY "Weekly plans viewable by manager or admin"
ON public.manager_weekly_plans FOR SELECT
TO authenticated
USING (
  auth.uid() = manager_id
  OR has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Deliverables viewable by authenticated" ON public.daily_plan_deliverables;
CREATE POLICY "Deliverables viewable by responsible or admin"
ON public.daily_plan_deliverables FOR SELECT
TO authenticated
USING (
  auth.uid() = responsible_user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.manager_daily_plans p
    WHERE p.id = daily_plan_deliverables.daily_plan_id
      AND p.manager_id = auth.uid()
  )
);
