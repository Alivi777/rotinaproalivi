
-- Remove redundant permissive SELECT policies that grant access to all authenticated users
DROP POLICY IF EXISTS "WA sessions viewable by authenticated" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Pending attendances viewable by authenticated" ON public.whatsapp_pending_attendances;

-- Restrict routine_tasks mutations to admins only (templates compartilhados)
DROP POLICY IF EXISTS "Authenticated can insert tasks" ON public.routine_tasks;
DROP POLICY IF EXISTS "Authenticated can update tasks" ON public.routine_tasks;
DROP POLICY IF EXISTS "Authenticated can delete tasks" ON public.routine_tasks;

CREATE POLICY "Admins insert routine tasks" ON public.routine_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update routine tasks" ON public.routine_tasks
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete routine tasks" ON public.routine_tasks
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
