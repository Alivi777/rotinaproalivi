import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AlertReason = "overdue_task" | "waiting_reply";

export type ClientAlerts = Record<string, AlertReason[]>;

/**
 * Returns a map: clientId -> reasons why the card should be highlighted RED.
 *  - overdue_task: client has an open client_task with due_date < today
 *  - waiting_reply: there is a pending WhatsApp attendance (status='waiting') for this client (by id or phone)
 */
export function useClientAlerts(clientPhones: { id: string; phone: string | null }[]) {
  const [alerts, setAlerts] = useState<ClientAlerts>({});

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [tasks, pendings] = await Promise.all([
      supabase
        .from("client_tasks")
        .select("client_id, due_date, completed_at")
        .is("completed_at", null)
        .lt("due_date", today),
      supabase
        .from("whatsapp_pending_attendances")
        .select("client_id, from_phone")
        .eq("status", "waiting"),
    ]);

    const map: ClientAlerts = {};
    const add = (id: string, r: AlertReason) => {
      if (!map[id]) map[id] = [];
      if (!map[id].includes(r)) map[id].push(r);
    };

    (tasks.data ?? []).forEach((t: any) => {
      if (t.client_id) add(t.client_id, "overdue_task");
    });

    const phoneIndex = new Map<string, string>();
    clientPhones.forEach((c) => {
      if (c.phone) phoneIndex.set(c.phone.replace(/\D/g, ""), c.id);
    });

    (pendings.data ?? []).forEach((p: any) => {
      if (p.client_id) add(p.client_id, "waiting_reply");
      else {
        const norm = (p.from_phone || "").replace(/\D/g, "");
        const cid = phoneIndex.get(norm);
        if (cid) add(cid, "waiting_reply");
      }
    });

    setAlerts(map);
  }, [clientPhones]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("client-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_tasks" }, load)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_pending_attendances" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { alerts, reload: load };
}

export function alertLabel(reasons: AlertReason[]): string {
  const parts: string[] = [];
  if (reasons.includes("overdue_task")) parts.push("Tarefa em atraso");
  if (reasons.includes("waiting_reply")) parts.push("Cliente sem resposta");
  return parts.join(" · ");
}
