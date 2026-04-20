import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export type DailyPriority = {
  id: string;
  user_id: string;
  priority_date: string;
  mission_main: string;
  secondary_1: string | null;
  secondary_2: string | null;
  yesterday_feedback: string | null;
  manager_id: string;
  status: "pending" | "acknowledged" | "questioned";
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export function useTodayPriority() {
  const { user } = useAuth();
  const [priority, setPriority] = useState<DailyPriority | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) {
      setPriority(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("daily_priorities")
      .select("*")
      .eq("user_id", user.id)
      .eq("priority_date", todayStr())
      .maybeSingle();
    setPriority((data as DailyPriority) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel(`priorities-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_priorities",
          filter: `user_id=eq.${user.id}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { priority, loading, reload: load };
}
