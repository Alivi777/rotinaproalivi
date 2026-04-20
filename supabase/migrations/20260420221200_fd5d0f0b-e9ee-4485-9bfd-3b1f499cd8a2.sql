
-- Helper: normalize phone (digits only)
CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(_phone, ''), '\D', '', 'g'), '');
$$;

-- contacts table (separate from kanban "clients")
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text,
  name text NOT NULL,
  phone text,
  phone_normalized text GENERATED ALWAYS AS (public.normalize_phone(phone)) STORED,
  email text,
  cpf text,
  birth_date date,
  address text,
  city text,
  state text,
  zip_code text,
  last_appointment_at date,
  tags text[] DEFAULT '{}',
  notes text,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  source text DEFAULT 'clinicorp',
  imported_at timestamptz,
  import_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX contacts_external_id_unique
  ON public.contacts (external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX contacts_cpf_unique
  ON public.contacts (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX contacts_phone_normalized_idx ON public.contacts (phone_normalized);
CREATE INDEX contacts_name_idx ON public.contacts USING gin (to_tsvector('portuguese', name));
CREATE INDEX contacts_sector_idx ON public.contacts (sector_id);
CREATE INDEX contacts_active_idx ON public.contacts (is_active);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Users see contacts of their own sector; admins see all
CREATE POLICY "Contacts viewable by sector or admin"
ON public.contacts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR sector_id IS NULL
  OR sector_id IN (SELECT sector_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Only admins manage contacts
CREATE POLICY "Admins insert contacts"
ON public.contacts FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update contacts"
ON public.contacts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete contacts"
ON public.contacts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- contact_imports: history of imports
CREATE TABLE public.contact_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by uuid NOT NULL,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  default_sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage contact imports"
ON public.contact_imports FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_contact_imports_updated_at
BEFORE UPDATE ON public.contact_imports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
