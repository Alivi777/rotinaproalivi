-- Unique partial indexes (permitem múltiplos NULL)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_external_id_unique
  ON public.contacts (external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_cpf_unique
  ON public.contacts (cpf)
  WHERE cpf IS NOT NULL;