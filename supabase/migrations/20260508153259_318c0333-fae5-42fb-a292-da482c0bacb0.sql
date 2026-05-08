ALTER TABLE public.clinic_daily_tasks
  DROP CONSTRAINT IF EXISTS clinic_daily_tasks_unique_per_appointment;

ALTER TABLE public.clinic_daily_tasks
  ADD CONSTRAINT clinic_daily_tasks_unique_per_appointment
  UNIQUE (appointment_id, task_type);

CREATE UNIQUE INDEX IF NOT EXISTS clinic_daily_tasks_unique_birthday
  ON public.clinic_daily_tasks (task_type, contact_id, task_date)
  WHERE appointment_id IS NULL AND task_type = 'birthday';