import { useEffect, useState } from "react";
import { useMyTodayAssignment, todayStr } from "@/lib/usePlanning";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Crosshair, Target, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MyDeliv = {
  id: string;
  title: string;
  done: boolean;
  due_date: string | null;
  status: string;
};

export default function MyAssignmentCard() {
  const { assignment, loading } = useMyTodayAssignment();
  const { user } = useAuth();
  const [delivs, setDelivs] = useState<MyDeliv[]>([]);

  async function loadDelivs() {
    if (!user) return;
    // Carrega entregáveis de planos de hoje cujo responsável sou eu
    const today = todayStr();
    const { data: plans } = await supabase
      .from("manager_daily_plans")
      .select("id")
      .eq("plan_date", today);
    const planIds = (plans ?? []).map((p) => p.id);
    if (planIds.length === 0) {
      setDelivs([]);
      return;
    }
    const { data } = await supabase
      .from("daily_plan_deliverables")
      .select("id, title, done, due_date, status")
      .in("daily_plan_id", planIds)
      .eq("responsible_user_id", user.id)
      .order("sort_order");
    setDelivs((data as MyDeliv[]) ?? []);
  }

  useEffect(() => {
    loadDelivs();
    if (!user) return;
    const ch = supabase
      .channel(`my-delivs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_plan_deliverables" },
        () => loadDelivs()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function toggle(d: MyDeliv, checked: boolean) {
    const { error } = await supabase
      .from("daily_plan_deliverables")
      .update({
        done: checked,
        done_at: checked ? new Date().toISOString() : null,
        done_by: checked ? user?.id ?? null : null,
        status: checked ? "done" : d.status === "done" ? "pending" : d.status,
      })
      .eq("id", d.id);
    if (error) return toast.error(error.message);
    loadDelivs();
  }

  if (loading) return null;
  if (!assignment && delivs.length === 0) return null;

  return (
    <Card className="p-5 mb-6 bg-gradient-card border-primary/40 shadow-glow">
      {assignment && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Crosshair className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">
              Suas 3 prioridades de hoje (gestor)
            </h2>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-2 rounded bg-primary/10 border border-primary/30">
              <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-primary font-bold">
                  Missão principal
                </div>
                <div className="text-sm font-medium">{assignment.main_mission}</div>
              </div>
            </div>
            {assignment.secondary_1 && (
              <div className="flex items-start gap-2 p-2 rounded border border-border/50">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">
                  Sec 1
                </span>
                <div className="text-sm">{assignment.secondary_1}</div>
              </div>
            )}
            {assignment.secondary_2 && (
              <div className="flex items-start gap-2 p-2 rounded border border-border/50">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">
                  Sec 2
                </span>
                <div className="text-sm">{assignment.secondary_2}</div>
              </div>
            )}
            {assignment.observation && (
              <p className="text-xs text-muted-foreground italic mt-2">
                {assignment.observation}
              </p>
            )}
          </div>
        </>
      )}

      {delivs.length > 0 && (
        <div className={cn(assignment && "mt-4 pt-4 border-t border-border/40")}>
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Meus entregáveis de hoje</h3>
          </div>
          <ul className="space-y-1.5">
            {delivs.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 p-2 rounded border border-border/50"
              >
                <Checkbox
                  checked={d.done}
                  onCheckedChange={(v) => toggle(d, !!v)}
                />
                <span
                  className={cn(
                    "text-sm flex-1",
                    d.done && "line-through text-muted-foreground"
                  )}
                >
                  {d.title}
                </span>
                {d.due_date && (
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {new Date(d.due_date + "T00:00:00").toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
