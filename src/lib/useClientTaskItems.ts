import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ClientTaskItem = {
  id: string;
  client_id: string;
  daily_task_id: string | null;
  task_type: string;
  task_label: string;
  task_howto: string | null;
  task_date: string;
  status: "pending" | "done";
  note: string | null;
  message_copy: string | null;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
};

/** Carrega itens de checklist para uma lista de client_ids. */
export function useClientTaskItems(clientIds: string[]) {
  const [items, setItems] = useState<ClientTaskItem[]>([]);
  const [loading, setLoading] = useState(false);

  const key = clientIds.slice().sort().join(",");

  const load = useCallback(async () => {
    if (clientIds.length === 0) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("client_task_items")
      .select("*")
      .in("client_id", clientIds)
      .order("sort_order");
    if (!error && data) setItems(data as ClientTaskItem[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("cti-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_task_items" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { items, loading, reload: load };
}
