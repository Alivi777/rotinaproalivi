
-- 1) Criar colunas por tipo de tarefa no setor Recepção
DO $$
DECLARE
  v_sector_id uuid;
BEGIN
  SELECT id INTO v_sector_id FROM public.sectors WHERE slug='recepcao';
  IF v_sector_id IS NULL THEN
    RAISE NOTICE 'Setor recepcao não encontrado';
    RETURN;
  END IF;

  -- Inserir/atualizar 8 etapas (idempotente via slug)
  INSERT INTO public.kanban_stages (sector_id, name, slug, sort_order, color, active, is_won, is_lost)
  VALUES
    (v_sector_id, '🎂 Aniversários', 'task-birthday', 2000, '#ec4899', true, false, false),
    (v_sector_id, 'Confirmar (D-7)', 'task-confirm-d7', 2010, '#3b82f6', true, false, false),
    (v_sector_id, 'Confirmar (D-6)', 'task-confirm-d6', 2020, '#3b82f6', true, false, false),
    (v_sector_id, 'Confirmar (D-5)', 'task-confirm-d5', 2030, '#3b82f6', true, false, false),
    (v_sector_id, 'Confirmar (D-4)', 'task-confirm-d4', 2040, '#3b82f6', true, false, false),
    (v_sector_id, 'Protocolo (D-3)', 'task-protocol-d3', 2050, '#f59e0b', true, false, false),
    (v_sector_id, 'Urgência (D-2)', 'task-urgency-d2', 2060, '#f97316', true, false, false),
    (v_sector_id, 'Desmarque (D-1)', 'task-unbook-d1', 2070, '#ef4444', true, false, false),
    (v_sector_id, '✅ Concluído', 'task-done', 2999, '#10b981', true, true, false)
  ON CONFLICT DO NOTHING;
END $$;

-- 2) Adicionar UNIQUE em (sector_id, slug) se não existir, para evitar duplicação no cron
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='kanban_stages_sector_slug_unique'
  ) THEN
    CREATE UNIQUE INDEX kanban_stages_sector_slug_unique
      ON public.kanban_stages(sector_id, slug);
  END IF;
END $$;

-- 3) Trigger: exigir notas ao mover card pra coluna is_won (concluído)
CREATE OR REPLACE FUNCTION public.enforce_note_on_won_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_is_won boolean;
BEGIN
  -- Só checa se mudou de etapa
  IF (TG_OP = 'UPDATE' AND OLD.stage_id IS DISTINCT FROM NEW.stage_id)
     OR (TG_OP = 'INSERT' AND NEW.stage_id IS NOT NULL) THEN
    SELECT is_won INTO v_is_won FROM public.kanban_stages WHERE id = NEW.stage_id;
    IF COALESCE(v_is_won, false) = true THEN
      IF NEW.notes IS NULL OR length(btrim(NEW.notes)) = 0 THEN
        RAISE EXCEPTION 'Para concluir o card é obrigatório registrar uma observação.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_enforce_note_on_won ON public.clients;
CREATE TRIGGER clients_enforce_note_on_won
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_note_on_won_stage();
