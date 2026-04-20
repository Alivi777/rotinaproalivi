-- Daily priorities delegated by the manager
CREATE TABLE public.daily_priorities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  priority_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mission_main TEXT NOT NULL,
  secondary_1 TEXT,
  secondary_2 TEXT,
  yesterday_feedback TEXT,
  manager_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, priority_date)
);

ALTER TABLE public.daily_priorities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Priorities viewable by authenticated"
ON public.daily_priorities FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins insert priorities"
ON public.daily_priorities FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update any priorities"
ON public.daily_priorities FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners update own priority status"
ON public.daily_priorities FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins delete priorities"
ON public.daily_priorities FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_daily_priorities_updated_at
BEFORE UPDATE ON public.daily_priorities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_daily_priorities_user_date ON public.daily_priorities(user_id, priority_date DESC);

-- Conversation thread between manager and collaborator about a priority
CREATE TABLE public.priority_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  priority_id UUID NOT NULL REFERENCES public.daily_priorities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.priority_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Priority messages viewable by authenticated"
ON public.priority_messages FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated insert priority messages"
ON public.priority_messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = author_id);

CREATE INDEX idx_priority_messages_priority ON public.priority_messages(priority_id, created_at);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_priorities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.priority_messages;