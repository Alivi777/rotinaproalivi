import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PeriodFilter, { defaultPeriod, type PeriodValue } from "@/components/PeriodFilter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList, CalendarRange, Archive } from "lucide-react";

type DailyPlan = {
  id: string; plan_date: string; main_mission: string | null;
  yesterday_main_mission: string | null; today_main_risk: string | null;
  notes: string | null; manager_id: string;
};
type WeeklyPlan = {
  id: string; week_start: string; week_focus: string | null;
  classification: string | null; notes: string | null; manager_id: string;
};

function fmtDate(s: string) {
  return new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "2-digit",
  });
}

export default function PlanningArchive() {
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod("month"));
  const [daily, setDaily] = useState<DailyPlan[]>([]);
  const [weekly, setWeekly] = useState<WeeklyPlan[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; display_name: string | null }[]>([]);

  useEffect(() => {
    supabase.from("profiles").select("user_id, display_name")
      .then(({ data }) => setProfiles(data ?? []));
  }, []);

  useEffect(() => {
    (async () => {
      const [d, w] = await Promise.all([
        supabase.from("manager_daily_plans")
          .select("id, plan_date, main_mission, yesterday_main_mission, today_main_risk, notes, manager_id")
          .gte("plan_date", period.from).lte("plan_date", period.to)
          .order("plan_date", { ascending: false }),
        supabase.from("manager_weekly_plans")
          .select("id, week_start, week_focus, classification, notes, manager_id")
          .gte("week_start", period.from).lte("week_start", period.to)
          .order("week_start", { ascending: false }),
      ]);
      setDaily((d.data as DailyPlan[]) ?? []);
      setWeekly((w.data as WeeklyPlan[]) ?? []);
    })();
  }, [period.from, period.to]);

  const nameOf = (uid: string) =>
    profiles.find((p) => p.user_id === uid)?.display_name || "—";

  return (
    <Card className="p-6 bg-card border-border/50">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Histórico arquivado</h2>
          <Badge variant="outline" className="text-[10px]">
            {daily.length} diários · {weekly.length} semanais
          </Badge>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" /> Diários
          </TabsTrigger>
          <TabsTrigger value="weekly" className="gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" /> Semanais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-3">
          {daily.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem planos no período.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {daily.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground w-24">
                      {fmtDate(p.plan_date)}
                    </span>
                    <span className="text-sm font-semibold">{nameOf(p.manager_id)}</span>
                  </div>
                  {p.main_mission && (
                    <p className="text-sm"><strong>Missão:</strong> {p.main_mission}</p>
                  )}
                  {p.today_main_risk && (
                    <p className="text-xs text-muted-foreground mt-1">⚠ {p.today_main_risk}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="weekly" className="mt-3">
          {weekly.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem planos no período.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {weekly.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground w-28">
                      Sem. {fmtDate(p.week_start)}
                    </span>
                    <span className="text-sm font-semibold">{nameOf(p.manager_id)}</span>
                    {p.classification && (
                      <Badge variant="secondary" className="text-[10px]">{p.classification}</Badge>
                    )}
                  </div>
                  {p.week_focus && (
                    <p className="text-sm"><strong>Foco:</strong> {p.week_focus}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
