ALTER TABLE public.clinic_doctors
ADD COLUMN IF NOT EXISTS name_locked boolean NOT NULL DEFAULT false;