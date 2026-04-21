import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { spDate, spToday } from "@/lib/spTime";

export type ClinicTask = {
  id: string;
  appointment_id: string | null;
  contact_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  appointment_at: string | null;
  task_type: string;
  task_date: string;
  assigned_to: string | null;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
};

export type ClinicDoctor = {
  id: string;
  external_id: string | null;
  name: string;
  assigned_user_id: string | null;
  color: string | null;
  active: boolean;
};

export const TASK_TYPE_LABEL: Record<string, string> = {
  birthday: "🎂 Aniversário",
  confirm_d7: "Confirmar (D-7)",
  confirm_d6: "Confirmar (D-6)",
  confirm_d5: "Confirmar (D-5)",
  confirm_d4: "Confirmar (D-4)",
  protocol_d3: "Protocolo falta confirmação (D-3)",
  urgency_d2: "Urgência/escassez (D-2)",
  unbook_confirm_d1: "Confirmação desmarque (D-1)",
};

export const TASK_TYPE_COLOR: Record<string, string> = {
  birthday: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
  confirm_d7: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  confirm_d6: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  confirm_d5: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  confirm_d4: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  protocol_d3: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  urgency_d2: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  unbook_confirm_d1: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

/**
 * Retorna a semana (Seg–Sáb) ancorada no fuso America/Sao_Paulo.
 * Cada Date retornado representa meia-noite local SP (UTC-3) do dia,
 * o que torna `spDate(d)` consistente com `task_date` (YYYY-MM-DD) salvo no banco.
 */
export function getWeekDates(reference?: Date): Date[] {
  // Pega o YYYY-MM-DD em SP da data de referência
  const refKey = reference ? spDate(reference) : spToday();
  const [y, m, d] = refKey.split("-").map(Number);
  // Constrói data local representando meia-noite SP. Usar offset -03:00 evita
  // qualquer ambiguidade do navegador.
  const refSp = new Date(`${refKey}T00:00:00-03:00`);
  const dow = refSp.getUTCDay() === 0 ? 7 : refSp.getUTCDay(); // 1..7 (Mon..Sun) em UTC equivalente a SP+03
  const monday = new Date(refSp);
  monday.setUTCDate(refSp.getUTCDate() - (dow - 1));
  return Array.from({ length: 6 }, (_, i) => {
    const x = new Date(monday);
    x.setUTCDate(monday.getUTCDate() + i);
    return x;
  });
}

/** YYYY-MM-DD da Date no fuso de São Paulo (consistente com `task_date`). */
export function dateOnly(d: Date): string {
  return spDate(d);
}

export function useAgendaClinica(weekDates: Date[]) {
  const [tasks, setTasks] = useState<ClinicTask[]>([]);
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [loading, setLoading] = useState(true);

  const start = dateOnly(weekDates[0]);
  const end = dateOnly(weekDates[weekDates.length - 1]);

  const load = useCallback(async () => {
    setLoading(true);
    const [tasksRes, drRes] = await Promise.all([
      supabase
        .from("clinic_daily_tasks")
        .select("*")
        .gte("task_date", start)
        .lte("task_date", end)
        .order("appointment_at", { ascending: true }),
      supabase.from("clinic_doctors").select("*").eq("active", true).order("name"),
    ]);
    setTasks((tasksRes.data || []) as ClinicTask[]);
    setDoctors((drRes.data || []) as ClinicDoctor[]);
    setLoading(false);
  }, [start, end]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("clinic-tasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clinic_daily_tasks" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { tasks, doctors, loading, reload: load };
}

export async function completeTask(id: string, userId: string) {
  return supabase
    .from("clinic_daily_tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: userId,
    })
    .eq("id", id);
}

export async function uncompleteTask(id: string) {
  return supabase
    .from("clinic_daily_tasks")
    .update({
      status: "pending",
      completed_at: null,
      completed_by: null,
    })
    .eq("id", id);
}
