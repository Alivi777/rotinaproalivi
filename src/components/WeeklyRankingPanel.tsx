import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { spToday, spWeekStart, fmtMinutes } from "@/lib/spTime";
import { Trophy, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Profile = {
  user_id: string;
  display_name: string | null;
  is_active: boolean;
  sector_id: string | null;
};

type Row = { user_id: string; total_minutes: number; session_count: number };

type Ranked = {
  user_id: string;
  display_name: string | null;
  efficiency: number;
  minutes: number;
  sessions: number;
  adherence: number;
  ackRate: number;
};

export default function WeeklyRankingPanel() {
  const [items, setItems] = useState<Ranked[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const start = spWeekStart();
    const end = spToday();

    const [m, p, pr, tc, sectorTasks] = await Promise.all([
      supabase.rpc("whatsapp_user_minutes", {
        _start_date: start,
        _end_date: end,
      }),
      supabase
        .from("profiles")
        .select("user_id, display_name, is_active, sector_id")
        .eq("is_active", true),
      supabase
        .from("daily_priorities")
        .select("user_id, status")
        .gte("priority_date", start)
        .lte("priority_date", end)
        .eq("status", "acknowledged"),
      supabase
        .from("task_completions")
        .select("user_id, task_id")
        .gte("completion_date", start)
        .lte("completion_date", end),
      supabase.from("routine_tasks").select("id, sector_id").eq("active", true),
    ]);

    const rows = (m.data as Row[]) ?? [];
    const profiles = (p.data as Profile[]) ?? [];

    const ack: Record<string, number> = {};
    (pr.data ?? []).forEach((r: any) => {
      ack[r.user_id] = (ack[r.user_id] ?? 0) + 1;
    });

    const comp: Record<string, number> = {};
    (tc.data ?? []).forEach((r: any) => {
      comp[r.user_id] = (comp[r.user_id] ?? 0) + 1;
    });

    const tasksBySector = new Map<string, number>();
    (sectorTasks.data ?? []).forEach((t: any) => {
      if (t.sector_id)
        tasksBySector.set(
          t.sector_id,
          (tasksBySector.get(t.sector_id) ?? 0) + 1
        );
    });
    const days = Math.max(
      1,
      Math.round(
        (new Date(end).getTime() - new Date(start).getTime()) /
          (24 * 3600 * 1000)
      ) + 1
    );

    const ranked: Ranked[] = profiles.map((pf) => {
      const r = rows.find((x) => x.user_id === pf.user_id);
      const minutes = r ? Number(r.total_minutes) : 0;
      const sessions = r ? Number(r.session_count) : 0;
      const compTotal = (tasksBySector.get(pf.sector_id ?? "") ?? 0) * days;
      const a = ack[pf.user_id] ?? 0;
      const c = comp[pf.user_id] ?? 0;
      const adherence = compTotal ? Math.min(1, c / compTotal) : 0;
      const ackRate = a > 0 ? Math.min(1, a / 7) : 0;
      const sessionsScore = Math.min(1, sessions / 15);
      const efficiency = Math.round(
        adherence * 40 + ackRate * 30 + sessionsScore * 30
      );
      return {
        user_id: pf.user_id,
        display_name: pf.display_name,
        efficiency,
        minutes,
        sessions,
        adherence: Math.round(adherence * 100),
        ackRate: a,
      };
    });

    setItems(ranked);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = [...items].sort((a, b) => b.efficiency - a.efficiency);
  const top = sorted.slice(0, 3);
  const bottom = items.length > 3 ? sorted.slice(-3).reverse() : [];

  return (
    <Card className="p-6 bg-card border-border/50">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Ranking semanal</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Score composto: 40% rotina + 30% prioridades aceitas + 30% atendimentos
          · Horário de São Paulo
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando ranking...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum colaborador ativo para ranquear.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <RankList
            title="Destaques da semana"
            icon={<TrendingUp className="h-4 w-4" />}
            tone="positive"
            items={top}
            emptyText="Sem dados suficientes."
          />
          <RankList
            title="Precisam de atenção"
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="negative"
            items={bottom}
            emptyText="Time pequeno: ranking inferior aparece com 4+ pessoas."
          />
        </div>
      )}
    </Card>
  );
}

function RankList({
  title,
  icon,
  tone,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "positive" | "negative";
  items: Ranked[];
  emptyText: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "positive"
          ? "border-primary/30 bg-primary/5"
          : "border-destructive/30 bg-destructive/5"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            tone === "positive" ? "text-primary" : "text-destructive"
          )}
        >
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, idx) => (
            <li
              key={it.user_id}
              className="flex items-center gap-3 p-2 rounded-md bg-background/60"
            >
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums",
                  tone === "positive"
                    ? "bg-primary text-primary-foreground"
                    : "bg-destructive text-destructive-foreground"
                )}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {it.display_name || "Sem nome"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {fmtMinutes(it.minutes)} · {it.sessions} atend. · rotina{" "}
                  {it.adherence}% · {it.ackRate} prio. aceitas
                </div>
              </div>
              <Badge
                variant={tone === "positive" ? "default" : "destructive"}
                className="tabular-nums"
              >
                {it.efficiency}%
              </Badge>
              {tone === "negative" ? (
                <TrendingDown className="h-4 w-4 text-destructive/70" />
              ) : (
                <TrendingUp className="h-4 w-4 text-primary/70" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
