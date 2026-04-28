DROP INDEX IF EXISTS public.contacts_external_id_unique;
DROP INDEX IF EXISTS public.contacts_cpf_unique;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_external_id_key UNIQUE (external_id);

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_cpf_key UNIQUE (cpf);