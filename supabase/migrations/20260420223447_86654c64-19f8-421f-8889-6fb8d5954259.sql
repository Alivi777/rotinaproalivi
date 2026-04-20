-- ============================================
-- TABLE: clinic_doctors
-- ============================================
CREATE TABLE public.clinic_doctors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT UNIQUE,
  name TEXT NOT NULL,
  assigned_user_id UUID,
  color TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors viewable by authenticated"
  ON public.clinic_doctors FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage doctors"
  ON public.clinic_doctors FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_clinic_doctors_updated_at
  BEFORE UPDATE ON public.clinic_doctors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial doctors (assigned_user_id will be set after users created via app)
INSERT INTO public.clinic_doctors (name, color, active) VALUES
  ('Dra. Davi', 'hsl(280 80% 60%)', true),
  ('Dra. Mariane', 'hsl(330 80% 60%)', true),
  ('Dra. Natasha', 'hsl(200 80% 60%)', true),
  ('Dra. Wanessa', 'hsl(150 70% 50%)', true),
  ('Dr. Alan', 'hsl(30 90% 55%)', true);

-- ============================================
-- TABLE: clinic_appointments
-- ============================================
CREATE TABLE public.clinic_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT UNIQUE,
  patient_external_id TEXT,
  contact_id UUID,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  doctor_id UUID REFERENCES public.clinic_doctors(id) ON DELETE SET NULL,
  doctor_external_id TEXT,
  doctor_name TEXT,
  appointment_at TIMESTAMPTZ NOT NULL,
  duration_min INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_at ON public.clinic_appointments(appointment_at);
CREATE INDEX idx_appointments_doctor ON public.clinic_appointments(doctor_id);
CREATE INDEX idx_appointments_contact ON public.clinic_appointments(contact_id);

ALTER TABLE public.clinic_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Appointments viewable by authenticated"
  ON public.clinic_appointments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage appointments"
  ON public.clinic_appointments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_clinic_appointments_updated_at
  BEFORE UPDATE ON public.clinic_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TABLE: clinic_daily_tasks
-- ============================================
CREATE TABLE public.clinic_daily_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID REFERENCES public.clinic_appointments(id) ON DELETE CASCADE,
  contact_id UUID,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  doctor_id UUID REFERENCES public.clinic_doctors(id) ON DELETE SET NULL,
  doctor_name TEXT,
  appointment_at TIMESTAMPTZ,
  task_type TEXT NOT NULL,
  task_date DATE NOT NULL,
  assigned_to UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinic_daily_tasks_unique_per_appointment
    UNIQUE NULLS NOT DISTINCT (appointment_id, task_type, contact_id)
);

CREATE INDEX idx_tasks_date ON public.clinic_daily_tasks(task_date);
CREATE INDEX idx_tasks_assigned ON public.clinic_daily_tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.clinic_daily_tasks(status);
CREATE INDEX idx_tasks_doctor ON public.clinic_daily_tasks(doctor_id);

ALTER TABLE public.clinic_daily_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tasks viewable by authenticated"
  ON public.clinic_daily_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert tasks"
  ON public.clinic_daily_tasks FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Assignee or admin updates tasks"
  ON public.clinic_daily_tasks FOR UPDATE TO authenticated
  USING (auth.uid() = assigned_to OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete tasks"
  ON public.clinic_daily_tasks FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_clinic_daily_tasks_updated_at
  BEFORE UPDATE ON public.clinic_daily_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.clinic_daily_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clinic_appointments;