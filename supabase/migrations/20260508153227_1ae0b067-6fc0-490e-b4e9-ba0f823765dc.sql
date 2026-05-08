ALTER TABLE public.clinic_daily_tasks
  DROP CONSTRAINT IF EXISTS clinic_daily_tasks_unique_per_appointment;

ALTER TABLE public.clinic_daily_tasks
  ADD CONSTRAINT clinic_daily_tasks_unique_per_appointment
  UNIQUE NULLS NOT DISTINCT (appointment_id, task_type);