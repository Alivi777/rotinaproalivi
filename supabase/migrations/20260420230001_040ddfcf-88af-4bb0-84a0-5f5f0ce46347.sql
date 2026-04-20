-- Garantir unique em external_id (necessário pro upsert da sync)
CREATE UNIQUE INDEX IF NOT EXISTS clinic_doctors_external_id_unique ON public.clinic_doctors(external_id) WHERE external_id IS NOT NULL;

-- Limpar registros antigos sem external_id (placeholders Dr. Alan, Dra. Davi etc.)
DELETE FROM public.clinic_doctors WHERE external_id IS NULL;

-- Inserir os 7 profissionais reais detectados na agenda
INSERT INTO public.clinic_doctors (external_id, name, active) VALUES
  ('4553828117577728', 'Profissional #4553828117577728', false),
  ('5716520699691008', 'Profissional #5716520699691008', false),
  ('6442024534867968', 'Profissional #6442024534867968', false),
  ('6744362126475264', 'Profissional #6744362126475264', false),
  ('5346381677854720', 'Profissional #5346381677854720', false),
  ('4849641424158721', 'Profissional #4849641424158721', false),
  ('5189704133640193', 'Profissional #5189704133640193', false)
ON CONFLICT (external_id) DO NOTHING;