import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type KanbanStage = {
  id: string;
  sector_id: string | null;
  name: string;
  slug: string;
  color: string | null;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
  active: boolean;
};

/**
 * Returns the kanban stages for a given sector. If the sector has no custom
 * stages, falls back to the global default template (sector_id IS NULL).
 */
export function useKanbanStages(sectorId: string | null | undefined) {
  const [stages, setStages] = useState<KanbanStage[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    let data: KanbanStage[] = [];
    if (sectorId) {
      const r = await supabase
        .from("kanban_stages")
        .select("*")
        .eq("sector_id", sectorId)
        .eq("active", true)
        .order("sort_order");
      data = (r.data ?? []) as KanbanStage[];
    }
    if (data.length === 0) {
      const r = await supabase
        .from("kanban_stages")
        .select("*")
        .is("sector_id", null)
        .eq("active", true)
        .order("sort_order");
      data = (r.data ?? []) as KanbanStage[];
    }
    setStages(data);
    setLoading(false);
  }, [sectorId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { stages, loading, reload };
}

export function useAllStages() {
  const [stages, setStages] = useState<KanbanStage[]>([]);
  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("kanban_stages")
      .select("*")
      .order("sector_id", { nullsFirst: true })
      .order("sort_order");
    setStages((data ?? []) as KanbanStage[]);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { stages, reload };
}
