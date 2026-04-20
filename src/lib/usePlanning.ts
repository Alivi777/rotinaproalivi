import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export type WeeklyPlan = {
  id: string;
  manager_id: string;
  week_start: string;
  method: string;
  prev_what_worked: string | null;
  prev_time_wasters: string | null;
  prev_excess_alignment: string | null;
  prev_excess_execution: string | null;
  prev_repeated_block: string | null;
  prev_single_correction: string | null;
  week_focus: string | null;
  fixed_commitments: string | null;
  not_this_week: string | null;
  mission_blocks: string | null;
  secondary_blocks: string | null;
  ind_alignments_done: number;
  ind_meetings_under_31: number;
  ind_missions_done: number;
  ind_blocks_protected: number;
  ind_tasks_delegated: number;
  ind_tasks_eliminated: number;
  ind_days_tomorrow_defined: number;
  ind_interruptions: number;
  classification: string | null;
  notes: string | null;
};

export type DailyPlan = {
  id: string;
  manager_id: string;
  plan_date: string;
  method: string;
  meeting_start: string | null;
  meeting_end: string | null;
  meeting_duration_min: number | null;
  conducted_by: string | null;
  participant_1: string | null;
  participant_2: string | null;
  participant_3: string | null;
  yesterday_main_mission: string | null;
  yesterday_status: string | null;
  yesterday_advanced: string | null;
  yesterday_blocked: string | null;
  yesterday_pending: string | null;
  today_fixed: string | null;
  today_urgencies: string | null;
  today_bottlenecks: string | null;
  today_main_risk: string | null;
  main_mission: string | null;
  secondary_1: string | null;
  secondary_2: string | null;
  to_block: string | null;
  to_delegate: string | null;
  not_today: string | null;
  needs_support: string | null;
  pending_next: string | null;
  opening_checklist: Record<string, boolean>;
  during_checklist: Record<string, boolean>;
  closing_checklist: Record<string, boolean>;
  notes: string | null;
};

export type Assignment = {
  id: string;
  daily_plan_id: string;
  assignee_id: string;
  main_mission: string;
  secondary_1: string | null;
  secondary_2: string | null;
  observation: string | null;
};

export type Deliverable = {
  id: string;
  daily_plan_id: string;
  title: string;
  responsible: string | null;
  responsible_user_id: string | null;
  due_date: string | null;
  status: string;
  sort_order: number;
};

export const todayStr = () => new Date().toISOString().slice(0, 10);

export function getMondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** For a logged in collaborator: fetch the assignment from manager for today */
export function useMyTodayAssignment() {
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<
    (Assignment & { plan_date: string }) | null
  >(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) {
      setAssignment(null);
      setLoading(false);
      return;
    }
    const today = todayStr();
    const { data: plans } = await supabase
      .from("manager_daily_plans")
      .select("id, plan_date")
      .eq("plan_date", today);
    if (!plans?.length) {
      setAssignment(null);
      setLoading(false);
      return;
    }
    const planIds = plans.map((p) => p.id);
    const { data: a } = await supabase
      .from("manager_daily_assignments")
      .select("*")
      .eq("assignee_id", user.id)
      .in("daily_plan_id", planIds)
      .maybeSingle();
    if (a) {
      const plan = plans.find((p) => p.id === a.daily_plan_id);
      setAssignment({ ...(a as Assignment), plan_date: plan?.plan_date ?? today });
    } else {
      setAssignment(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel(`my-assignment-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "manager_daily_assignments",
          filter: `assignee_id=eq.${user.id}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { assignment, loading, reload: load };
}
