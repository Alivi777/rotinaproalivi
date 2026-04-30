ALTER TABLE public.daily_priorities
  ADD COLUMN IF NOT EXISTS mission_main_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mission_main_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS secondary_1_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS secondary_1_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS secondary_2_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS secondary_2_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_note text;