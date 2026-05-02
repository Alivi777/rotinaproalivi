-- Time clock (ponto eletrônico)
CREATE TABLE public.time_clock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  clock_in timestamptz,
  lunch_start timestamptz,
  lunch_end timestamptz,
  clock_out timestamptz,
  notes text,
  edited_by uuid,
  edited_at timestamptz,
  edit_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, entry_date)
);

ALTER TABLE public.time_clock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entries viewable by owner or admin"
  ON public.time_clock_entries FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own entries"
  ON public.time_clock_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners punch own entries"
  ON public.time_clock_entries FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage entries"
  ON public.time_clock_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_time_clock_updated
  BEFORE UPDATE ON public.time_clock_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit of edits made by admin
CREATE TABLE public.time_clock_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  edited_by uuid NOT NULL,
  field_name text NOT NULL,
  old_value timestamptz,
  new_value timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_clock_edit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Edit log viewable by admin or owner"
  ON public.time_clock_edit_log FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.time_clock_entries e WHERE e.id = entry_id AND e.user_id = auth.uid())
  );

CREATE POLICY "Admins insert edit log"
  ON public.time_clock_edit_log FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') AND auth.uid() = edited_by);

-- Correction requests by collaborator
CREATE TABLE public.time_clock_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid,
  user_id uuid NOT NULL,
  entry_date date NOT NULL,
  requested_clock_in timestamptz,
  requested_lunch_start timestamptz,
  requested_lunch_end timestamptz,
  requested_clock_out timestamptz,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_clock_correction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requests viewable by owner or admin"
  ON public.time_clock_correction_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own requests"
  ON public.time_clock_correction_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own pending requests"
  ON public.time_clock_correction_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins manage requests"
  ON public.time_clock_correction_requests FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_time_clock_req_updated
  BEFORE UPDATE ON public.time_clock_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_time_clock_user_date ON public.time_clock_entries(user_id, entry_date DESC);
CREATE INDEX idx_time_clock_req_status ON public.time_clock_correction_requests(status, created_at DESC);