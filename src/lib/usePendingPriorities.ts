import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "./useIsAdmin";

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * For admins: how many collaborators have priorities delegated for today
 * but have NOT yet acknowledged them.
 */
export function usePendingPriorities() {
  const { isAdmin } = useIsAdmin();
  const [count, setCount] = useState(0);

  async function load() {
    if (!isAdmin) {
      setCount(0);
      return;
    }
    const { count: c } = await supabase
      .from("daily_priorities")
      .select("id", { count: "exact", head: true })
      .eq("priority_date", todayStr())
      .neq("status", "acknowledged");
    setCount(c ?? 0);
  }

  useEffect(() => {
    load();
    if (!isAdmin) return;
    const ch = supabase
      .channel("pending-priorities-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_priorities" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  return { count };
}
