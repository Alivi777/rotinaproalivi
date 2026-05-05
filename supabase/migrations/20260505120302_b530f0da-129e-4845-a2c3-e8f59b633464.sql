ALTER TABLE public.client_task_items REPLICA IDENTITY FULL;
ALTER TABLE public.client_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.task_completions REPLICA IDENTITY FULL;
ALTER TABLE public.sector_monthly_metrics REPLICA IDENTITY FULL;
ALTER TABLE public.routine_tasks REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_task_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.task_completions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sector_monthly_metrics; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.routine_tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;