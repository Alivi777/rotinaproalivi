import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SectorMetric = {
  id: string;
  sector_id: string;
  period_month: string;
  label: string;
  target_text: string | null;
  target_value: number | null;
  actual_value: number | null;
  actual_text: string | null;
  unit: string | null;
  auto_source: string | null;
  sort_order: number;
  notes: string | null;
};

export function monthStartStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthEndStr(d = new Date()) {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

export const GENERAL_SECTOR = "_general";

export function useSectorMetrics(sectorId: string | null | undefined, periodMonth: string) {
  const [metrics, setMetrics] = useState<SectorMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (sectorId === undefined || sectorId === null || sectorId === "") {
      setMetrics([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("sector_monthly_metrics")
      .select("*")
      .eq("period_month", periodMonth)
      .order("sort_order");
    if (sectorId === GENERAL_SECTOR) q = q.is("sector_id", null);
    else q = q.eq("sector_id", sectorId);
    const { data } = await q;
    setMetrics((data as SectorMetric[]) ?? []);
    setLoading(false);
  }, [sectorId, periodMonth]);

  useEffect(() => {
    reload();
    if (!sectorId) return;
    const ch = supabase
      .channel(`metrics-${sectorId}-${periodMonth}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sector_monthly_metrics" },
        () => reload()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [reload, sectorId, periodMonth]);

  return { metrics, loading, reload };
}

/** Calcula valores automáticos a partir das tabelas existentes. */
export async function computeAutoMetrics(periodMonth: string): Promise<Record<string, number>> {
  const start = periodMonth;
  const end = monthEndStr(new Date(periodMonth));
  const result: Record<string, number> = {};

  // sales_count, sales_revenue, new_patients
  const { data: sales } = await supabase
    .from("sales")
    .select("amount, is_new_patient")
    .gte("sale_date", start)
    .lte("sale_date", end);
  if (sales) {
    result["sales_count"] = sales.length;
    result["sales_revenue"] = sales.reduce((s, x: any) => s + Number(x.amount || 0), 0);
    result["new_patients"] = sales.filter((s: any) => s.is_new_patient).length;
  }

  // appointments_count
  const { count: apptCount } = await supabase
    .from("clinic_appointments")
    .select("id", { count: "exact", head: true })
    .gte("appointment_at", `${start}T00:00:00`)
    .lte("appointment_at", `${end}T23:59:59`);
  if (apptCount !== null) result["appointments_count"] = apptCount;

  // tasks_done
  const { count: doneCount } = await supabase
    .from("client_task_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "done")
    .gte("task_date", start)
    .lte("task_date", end);
  if (doneCount !== null) result["tasks_done"] = doneCount;

  return result;
}
