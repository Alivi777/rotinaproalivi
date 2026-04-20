-- 1. Pending attendances queue
CREATE TABLE public.whatsapp_pending_attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  from_phone text NOT NULL,
  from_name text,
  assigned_to uuid,
  sector_id uuid REFERENCES public.sectors(id),
  classification text NOT NULL DEFAULT 'recepcao',
  status text NOT NULL DEFAULT 'waiting', -- waiting | attended | transferred
  last_message_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  transferred_from uuid,
  transferred_to uuid,
  transfer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wpa_assigned_status ON public.whatsapp_pending_attendances(assigned_to, status);
CREATE INDEX idx_wpa_phone_status ON public.whatsapp_pending_attendances(from_phone, status);

ALTER TABLE public.whatsapp_pending_attendances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pending attendances viewable by authenticated"
  ON public.whatsapp_pending_attendances FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "System or admin insert pending attendances"
  ON public.whatsapp_pending_attendances FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Assignee or admin update pending"
  ON public.whatsapp_pending_attendances FOR UPDATE
  TO authenticated
  USING (auth.uid() = assigned_to OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete pending"
  ON public.whatsapp_pending_attendances FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_wpa_updated_at
  BEFORE UPDATE ON public.whatsapp_pending_attendances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_pending_attendances;
ALTER TABLE public.whatsapp_pending_attendances REPLICA IDENTITY FULL;

-- 2. Working hours per user
CREATE TABLE public.user_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  start_time time NOT NULL,
  end_time time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_uwh_user ON public.user_working_hours(user_id);

ALTER TABLE public.user_working_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Working hours viewable by authenticated"
  ON public.user_working_hours FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users manage own working hours"
  ON public.user_working_hours FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_uwh_updated_at
  BEFORE UPDATE ON public.user_working_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add classification to messages
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'recepcao';

-- 4. Function to assign attendance (round-robin within sector + working hours)
CREATE OR REPLACE FUNCTION public.assign_whatsapp_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sector_id uuid;
  v_assigned uuid;
  v_existing uuid;
  v_client_assigned uuid;
  v_dow int;
  v_now_time time;
  v_sector_slug text;
BEGIN
  v_sector_slug := COALESCE(NEW.classification, 'recepcao');

  -- Pick sector by slug match (recepcao / comercial); fallback to first sector
  SELECT id INTO v_sector_id FROM public.sectors
   WHERE slug ILIKE v_sector_slug OR name ILIKE v_sector_slug
   ORDER BY sort_order LIMIT 1;

  -- If client exists and already assigned, route to that user
  IF NEW.client_id IS NOT NULL THEN
    SELECT assigned_to INTO v_client_assigned FROM public.clients WHERE id = NEW.client_id;
    IF v_client_assigned IS NOT NULL THEN
      v_assigned := v_client_assigned;
    END IF;
  END IF;

  -- If no client-based assignment, round-robin within sector & working hours
  IF v_assigned IS NULL AND v_sector_id IS NOT NULL THEN
    v_dow := EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Sao_Paulo'));
    v_now_time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;

    SELECT p.user_id INTO v_assigned
      FROM public.profiles p
      LEFT JOIN public.user_working_hours w
        ON w.user_id = p.user_id
       AND w.day_of_week = v_dow
       AND w.active = true
       AND v_now_time BETWEEN w.start_time AND w.end_time
     WHERE p.is_active = true
       AND p.sector_id = v_sector_id
       AND (w.id IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM public.user_working_hours uw WHERE uw.user_id = p.user_id))
     ORDER BY (
       SELECT COUNT(*) FROM public.whatsapp_pending_attendances wpa
        WHERE wpa.assigned_to = p.user_id AND wpa.status = 'waiting'
     ) ASC, random()
     LIMIT 1;
  END IF;

  -- Update or insert pending attendance
  SELECT id INTO v_existing FROM public.whatsapp_pending_attendances
   WHERE from_phone = NEW.from_phone AND status = 'waiting'
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.whatsapp_pending_attendances
       SET last_message_at = now(),
           client_id = COALESCE(client_id, NEW.client_id),
           from_name = COALESCE(from_name, NEW.from_name)
     WHERE id = v_existing;
  ELSE
    INSERT INTO public.whatsapp_pending_attendances
      (client_id, from_phone, from_name, assigned_to, sector_id, classification, last_message_at)
    VALUES (NEW.client_id, NEW.from_phone, NEW.from_name, v_assigned, v_sector_id, v_sector_slug, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_whatsapp_assign_attendance
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.assign_whatsapp_attendance();

-- 5. Helper: transfer attendance
CREATE OR REPLACE FUNCTION public.transfer_attendance(
  _attendance_id uuid,
  _to_user uuid,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current uuid;
BEGIN
  SELECT assigned_to INTO v_current FROM public.whatsapp_pending_attendances WHERE id = _attendance_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Attendance not found';
  END IF;
  IF v_current <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed to transfer this attendance';
  END IF;

  UPDATE public.whatsapp_pending_attendances
     SET assigned_to = _to_user,
         transferred_from = v_current,
         transferred_to = _to_user,
         transfer_note = _note,
         updated_at = now()
   WHERE id = _attendance_id;
END;
$$;