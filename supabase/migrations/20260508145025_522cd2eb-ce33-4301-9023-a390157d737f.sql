-- Reconcile doctor_id/doctor_name on clinic_daily_tasks with their parent appointments
UPDATE public.clinic_daily_tasks t
   SET doctor_id = a.doctor_id,
       doctor_name = a.doctor_name,
       appointment_at = a.appointment_at,
       updated_at = now()
  FROM public.clinic_appointments a
 WHERE t.appointment_id = a.id
   AND (t.doctor_id IS DISTINCT FROM a.doctor_id
        OR t.doctor_name IS DISTINCT FROM a.doctor_name
        OR t.appointment_at IS DISTINCT FROM a.appointment_at);