-- Garantir índices únicos para upsert por external_id e cpf na tabela de contatos
CREATE UNIQUE INDEX IF NOT EXISTS contacts_external_id_unique
  ON public.contacts (external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_cpf_unique
  ON public.contacts (cpf)
  WHERE cpf IS NOT NULL;

-- Índice para busca rápida por telefone normalizado
CREATE INDEX IF NOT EXISTS contacts_phone_normalized_idx
  ON public.contacts (phone_normalized)
  WHERE phone_normalized IS NOT NULL;