import { useEffect, useRef, useState, useCallback } from "react";
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

const CLIENT_IDS_BATCH_SIZE = 150;

function chunkIds(ids: string[], size: number) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

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

    const batches = chunkIds(clientIds, CLIENT_IDS_BATCH_SIZE);
    const results = await Promise.all(
      batches.map((batch) =>
        supabase.from("client_task_items").select("*").in("client_id", batch).order("sort_order"),
      ),
    );

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      console.error("Erro ao carregar client_task_items", firstError);
      setItems([]);
      setLoading(false);
      return;
    }

    const merged = results.flatMap((result) => (result.data ?? []) as ClientTaskItem[]);
    merged.sort((a, b) => {
      if (a.client_id !== b.client_id) return a.client_id.localeCompare(b.client_id);
      return a.sort_order - b.sort_order;
    });

    setItems(merged);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`cti-live:${key || "empty"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_task_items" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, key]);

  return { items, loading, reload: load };
}
