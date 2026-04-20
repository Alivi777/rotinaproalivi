
-- Track when each contact was last synced from Clinicorp
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS contacts_last_synced_idx ON public.contacts (last_synced_at);

-- Enable scheduling extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
