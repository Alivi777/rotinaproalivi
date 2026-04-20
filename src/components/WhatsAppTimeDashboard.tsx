import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/lib/useIsAdmin";
import {
  spToday,
  spDaysAgo,
  spWeekStart,
  spMonthStart,
  spYearStart,
  fmtMinutes,
} from "@/lib/spTime";
import { Clock, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Profile = {
  user_id: string;
  display_name: string | null;
  is_active: boolean;
};

type Row = {
  user_id: string;
  total_minutes: number;
  session_count: number;
};

type Range = "day" | "week" | "month" | "year" | "custom";

function rangeDates(r: Range, custom?: { start: string; end: string }) {
  const today = spToday();
  switch (r) {
    case "day":
      return { start: today, end: today };
    case "week":
      return { start: spWeekStart(), end: today };
    case "month":
      return { start: spMonthStart(), end: today };
    case "year":
      return { start: spYearStart(), end: today };
    case "custom":
      return {
        start: custom?.start ?? spDaysAgo(7),
        end: custom?.end ?? today,
      };
  }
}

export default function WhatsAppTimeDashboard() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [range, setRange] = useState<Range>("day");
  const [custom, setCustom] = useState({ start: spDaysAgo(7), end: spToday() });
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  // For efficiency: priorities accepted + routine adherence in same range
  const [priorityAck, setPriorityAck] = useState<Record<string, number>>({});
  const [taskCompletions, setTaskCompletions] = useState<Record<string, number>>({});
  const [taskTotals, setTaskTotals] = useState<Record<string, number>>({});
  const [selectedUser, setSelectedUser] = useState<string>("all");

  async function load() {
    const { start, end } = rangeDates(range, custom);

    const [m, p, pr, tc, sectorTasks] = await Promise.all([
      supabase.rpc("whatsapp_user_minutes", {
        _start_date: start,
        _end_date: end,
      }),
      supabase
        .from("profiles")
        .select("user_id, display_name, is_active, sector_id"),
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
      supabase
        .from("routine_tasks")
        .select("id, sector_id")
        .eq("active", true),
    ]);

    setRows((m.data as Row[]) ?? []);
    setProfiles((p.data as Profile[]) ?? []);

    const ack: Record<string, number> = {};
    (pr.data ?? []).forEach((r: any) => {
      ack[r.user_id] = (ack[r.user_id] ?? 0) + 1;
    });
    setPriorityAck(ack);

    const comp: Record<string, number> = {};
    (tc.data ?? []).forEach((r: any) => {
      comp[r.user_id] = (comp[r.user_id] ?? 0) + 1;
    });
    setTaskCompletions(comp);

    // Compute total available task slots = (#days in range) * sectorTasksCount(per user)
    const tasksBySector = new Map<string, number>();
    (sectorTasks.data ?? []).forEach((t: any) => {
      tasksBySector.set(t.sector_id, (tasksBySector.get(t.sector_id) ?? 0) + 1);
    });
    const days =
      Math.max(
        1,
        Math.round(
          (new Date(end).getTime() - new Date(start).getTime()) /
            (24 * 3600 * 1000)
        ) + 1
      );
    const totals: Record<string, number> = {};
    (p.data ?? []).forEach((pr: any) => {
      const t = tasksBySector.get(pr.sector_id) ?? 0;
      totals[pr.user_id] = t * days;
    });
    setTaskTotals(totals);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, custom.start, custom.end]);

  // Filter to current user if not admin
  const visibleProfiles = isAdmin
    ? profiles.filter((p) => p.is_active)
    : profiles.filter((p) => p.user_id === user?.id);

  const merged = visibleProfiles
    .map((p) => {
      const r = rows.find((x) => x.user_id === p.user_id);
      const minutes = r ? Number(r.total_minutes) : 0;
      const sessions = r ? Number(r.session_count) : 0;
      const ack = priorityAck[p.user_id] ?? 0;
      const comp = taskCompletions[p.user_id] ?? 0;
      const compTotal = taskTotals[p.user_id] ?? 0;
      // Composite efficiency:
      //   40% routine adherence + 30% priorities accepted (cap 30 days) + 30% sessions per day worked
      const adherence = compTotal ? Math.min(1, comp / compTotal) : 0;
      const ackRate = ack > 0 ? Math.min(1, ack / 30) : 0;
      const sessionsScore = Math.min(1, sessions / 30);
      const efficiency = Math.round(
        (adherence * 40 + ackRate * 30 + sessionsScore * 30)
      );
      return { ...p, minutes, sessions, efficiency };
    })
    .sort((a, b) => b.minutes - a.minutes);

  const totalMin = merged.reduce((s, m) => s + m.minutes, 0);
  const totalSessions = merged.reduce((s, m) => s + m.sessions, 0);
  const avgEff = merged.length
    ? Math.round(merged.reduce((s, m) => s + m.efficiency, 0) / merged.length)
    : 0;

  return (
    <Card className="p-6 bg-card border-border/50">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Tempo de atendimento WhatsApp</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Horário de São Paulo · {isAdmin ? "Time inteiro" : "Apenas você"}
          </p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="day">Dia</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
            {isAdmin && <TabsTrigger value="year">Ano</TabsTrigger>}
            <TabsTrigger value="custom">Período</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {range === "custom" && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div>
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              value={custom.start}
              onChange={(e) => setCustom({ ...custom, start: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              value={custom.end}
              onChange={(e) => setCustom({ ...custom, end: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Mini
          label="Total atendido"
          value={fmtMinutes(totalMin)}
          icon={<Clock className="h-4 w-4 text-primary" />}
        />
        <Mini
          label="Atendimentos"
          value={String(totalSessions)}
          icon={<Users className="h-4 w-4 text-primary" />}
        />
        <Mini
          label="Eficiência média"
          value={`${avgEff}%`}
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
        />
      </div>

      <ul className="divide-y divide-border/50">
        {merged.length === 0 && (
          <li className="py-6 text-sm text-center text-muted-foreground">
            Nenhum atendimento registrado neste período.
          </li>
        )}
        {merged.map((m) => (
          <li key={m.user_id} className="py-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-32">
              <div className="text-sm font-medium">
                {m.display_name || "Sem nome"}
                {m.user_id === user?.id && (
                  <span className="ml-1 text-xs text-primary">(você)</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {m.sessions} atendimento(s)
              </div>
            </div>
            <div className="text-sm font-bold tabular-nums w-20 text-right">
              {fmtMinutes(m.minutes)}
            </div>
            <div className="w-32">
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    m.efficiency >= 70
                      ? "bg-primary"
                      : m.efficiency >= 40
                      ? "bg-secondary-foreground/40"
                      : "bg-destructive/60"
                  )}
                  style={{ width: `${m.efficiency}%` }}
                />
              </div>
            </div>
            <Badge
              variant={m.efficiency >= 70 ? "default" : "secondary"}
              className="w-14 justify-center tabular-nums"
            >
              {m.efficiency}%
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Mini({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="p-3 rounded-lg bg-background/40 border border-border/40">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {icon}
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
