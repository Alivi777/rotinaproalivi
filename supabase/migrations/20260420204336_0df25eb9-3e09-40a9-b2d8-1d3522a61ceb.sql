CREATE TABLE public.team_feedbacks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  manager_id UUID NOT NULL,
  feedback_type TEXT NOT NULL DEFAULT 'feedback' CHECK (feedback_type IN ('contract', 'feedback')),
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  week_of_month INT NOT NULL DEFAULT 1,
  reference_month DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE),

  -- Common header
  role TEXT,
  department TEXT,
  period_start DATE,
  period_end DATE,
  next_alignment_date DATE,

  -- Weekly feedback fields
  last_week_numbers TEXT,
  last_week_conversion TEXT,
  last_week_organization TEXT,
  last_week_closings TEXT,
  last_week_behavior TEXT,
  last_week_hit_goal TEXT,
  last_week_focus_energy TEXT,
  needs_improvement TEXT,
  commitment_meetings TEXT,
  commitment_goal TEXT,
  commitment_how TEXT,
  attitude_1 TEXT,
  attitude_2 TEXT,
  attitude_3 TEXT,
  observation TEXT,

  -- Contract fields (1st week of month)
  deliverables TEXT,
  expected_behavior TEXT,
  non_negotiables TEXT,
  closing_message TEXT,

  -- Signatures
  manager_signed_at TIMESTAMP WITH TIME ZONE,
  manager_signature_name TEXT,
  collaborator_signed_at TIMESTAMP WITH TIME ZONE,
  collaborator_signature_name TEXT,
  collaborator_response TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_feedbacks_user ON public.team_feedbacks(user_id, reference_date DESC);
CREATE INDEX idx_team_feedbacks_month ON public.team_feedbacks(reference_month);

ALTER TABLE public.team_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all feedbacks"
ON public.team_feedbacks
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view own feedbacks"
ON public.team_feedbacks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users sign own feedbacks"
ON public.team_feedbacks
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_team_feedbacks_updated_at
BEFORE UPDATE ON public.team_feedbacks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();