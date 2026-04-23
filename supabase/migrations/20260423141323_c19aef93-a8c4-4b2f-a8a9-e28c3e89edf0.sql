ALTER TABLE public.client_notes
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS client_notes_source_external_id_uniq
  ON public.client_notes (source, external_id)
  WHERE external_id IS NOT NULL;