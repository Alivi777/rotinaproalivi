UPDATE public.clinic_doctors
SET name_locked = true
WHERE external_id IS NOT NULL;