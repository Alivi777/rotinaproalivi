-- 1) Remove duplicatas existentes mantendo o card mais antigo por (paciente, dia, tipo)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY
             COALESCE(
               contact_id::text,
               NULLIF(regexp_replace(COALESCE(patient_phone,''), '\D', '', 'g'), ''),
               lower(btrim(patient_name))
             ),
             task_date,
             task_type
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM public.clinic_daily_tasks
)
DELETE FROM public.clinic_daily_tasks t
 USING ranked r
 WHERE t.id = r.id AND r.rn > 1;

-- 2) Cria índice único por expressão (paciente, dia, tipo)
CREATE UNIQUE INDEX IF NOT EXISTS clinic_daily_tasks_patient_day_type_uniq
  ON public.clinic_daily_tasks (
    (COALESCE(
      contact_id::text,
      NULLIF(regexp_replace(COALESCE(patient_phone,''), '\D', '', 'g'), ''),
      lower(btrim(patient_name))
    )),
    task_date,
    task_type
  );