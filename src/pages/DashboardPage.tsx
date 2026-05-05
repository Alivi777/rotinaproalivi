import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSectors, useProfile } from "@/lib/useProfile";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { useAuth } from "@/lib/auth";
import PriorityAlert from "@/components/PriorityAlert";
import CollaboratorTasksPanel from "@/components/CollaboratorTasksPanel";
import SectorResultsPanel from "@/components/SectorResultsPanel";
import ClinicDashboardTab from "@/components/ClinicDashboardTab";
import PeriodFilter, { defaultPeriod, type PeriodValue, usePeriodLabel } from "@/components/PeriodFilter";
import { spToday, fmtMinutes } from "@/lib/spTime";
import {
  Calendar,
  TrendingUp,
  Activity,
  LayoutDashboard,
  Stethoscope,
  ClipboardList,
  Users,
  Target,
  Clock,
  CheckCircle2,
} from "lucide-react";

type RoutineTask = { id: string; sector_id: string | null; title: string };
type Completion = { task_id: string; user_id: string; completion_date: string };
type ClientTaskItem = {
  id: string;
  client_id: string;
  status: string;
  task_date: string;
  completed_by: string | null;
};
type Client = { id: string; assigned_to: string | null; sector_id: string | null };
type Profile = { user_id: string; display_name: string | null; sector_id: string | null };
type ClockEntry = {
  user_id: string;
  entry_date: string;
  clock_in: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  clock_out: string | null;
};

function minutesBetween(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);
}
function entryMinutes(e: ClockEntry): number {
  if (!e.clock_in) return 0;
  const end = e.clock_out ?? new Date().toISOString();
  let total = minutesBetween(e.clock_in, end);
  total -= minutesBetween(e.lunch_start, e.lunch_end);
  return Math.max(0, Math.round(total));
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { profile } = useProfile();
  const { sectors } = useSectors();

  const [scope, setScope] = useState<"me" | "all">("me");
  useEffect(() => {
    if (!adminLoading) setScope(isAdmin ? "all" : "me");
  }, [isAdmin, adminLoading]);

  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod("week"));
  const periodLabel = usePeriodLabel(period);
  const weekStart = period.from;
  const today = period.to;
  const todayReal = spToday();

  const [tasks, setTasks] = useState<RoutineTask[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [clientTasks, setClientTasks] = useState<ClientTaskItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clockEntries, setClockEntries] = useState<ClockEntry[]>([]);

  async function load() {
    const [t, c, ct, cl, pr, ce] = await Promise.all([
      supabase.from("routine_tasks").select("id, sector_id, title").eq("active", true),
      supabase
        .from("task_completions")
        .select("task_id, user_id, completion_date")
        .gte("completion_date", weekStart)
        .lte("completion_date", today),
      supabase
        .from("client_task_items")
        .select("id, client_id, status, task_date, completed_by")
        .gte("task_date", weekStart)
        .lte("task_date", today),
      supabase.from("clients").select("id, assigned_to, sector_id"),
      supabase.from("profiles").select("user_id, display_name, sector_id").eq("is_active", true),
      supabase
        .from("time_clock_entries")
        .select("user_id, entry_date, clock_in, lunch_start, lunch_end, clock_out")
        .gte("entry_date", weekStart)
        .lte("entry_date", today),
    ]);
    if (t.data) setTasks(t.data as RoutineTask[]);
    if (c.data) setCompletions(c.data as Completion[]);
    if (ct.data) setClientTasks(ct.data as ClientTaskItem[]);
    if (cl.data) setClients(cl.data as Client[]);
    if (pr.data) setProfiles(pr.data as Profile[]);
    if (ce.data) setClockEntries(ce.data as ClockEntry[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("dash-crm-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_completions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_task_items" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_clock_entries" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, today]);

  const profileBy = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const clientBy = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  // Filter scope
  const myUid = user?.id;
  const inScopeUser = (uid: string | null | undefined) =>
    scope === "all" ? true : uid === myUid;

  // ─── Aderência de Rotina (por setor, semana) ─────────────────────────
  // Considera: total = tarefas ativas × dias úteis da semana até hoje (1 marcação por tarefa/dia/usuário)
  // Apenas dias úteis (seg-sex) decorridos da semana atual até hoje
  const daysInWeek = useMemo(() => {
    const days: string[] = [];
    const start = new Date(`${weekStart}T00:00:00`);
    const endD = new Date(`${today}T00:00:00`);
    for (let d = new Date(start); d <= endD; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); // 0=dom, 6=sáb
      if (dow === 0 || dow === 6) continue;
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }, [weekStart, today]);

  // Esperado: dias úteis dentro do período selecionado
  const expectedWeekdays = useMemo(() => {
    let n = 0;
    const start = new Date(`${weekStart}T00:00:00`);
    const end = new Date(`${today}T00:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) n++;
    }
    return n;
  }, [weekStart, today]);

  const sectorAdherence = useMemo(() => {
    return sectors.map((s) => {
      const sTasks = tasks.filter((t) => t.sector_id === s.id);
      // total esperado = tarefas × 5 dias úteis (semana cheia)
      const totalExpected = sTasks.length * expectedWeekdays;
      // marcações no período para essas tarefas (filtradas por scope)
      const sectorTaskIds = new Set(sTasks.map((t) => t.id));
      const weekdaySet = new Set(daysInWeek);
      const sCompletions = completions.filter(
        (c) =>
          sectorTaskIds.has(c.task_id) &&
          weekdaySet.has(c.completion_date) &&
          inScopeUser(c.user_id),
      );
      // distintas por (task_id + date) para evitar dupla contagem
      const distinct = new Set(sCompletions.map((c) => `${c.task_id}|${c.completion_date}`)).size;
      const pct = totalExpected ? Math.round((distinct / totalExpected) * 100) : 0;
      return {
        id: s.id,
        name: s.name,
        tasksCount: sTasks.length,
        expected: totalExpected,
        done: distinct,
        pct,
      };
    });
  }, [sectors, tasks, completions, daysInWeek, scope, myUid]);

  // ─── Aderência de Tarefas com Clientes (semana) ──────────────────────
  const clientAdherence = useMemo(() => {
    const filtered = clientTasks.filter((it) => {
      if (scope === "all") return true;
      const c = clientBy.get(it.client_id);
      return (
        c?.assigned_to === myUid ||
        it.completed_by === myUid
      );
    });
    const total = filtered.length;
    const done = filtered.filter((i) => i.status === "done").length;
    const overdue = filtered.filter((i) => i.status !== "done" && i.task_date < todayReal).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, overdue, pct };
  }, [clientTasks, clientBy, scope, myUid, todayReal]);

  // ─── Horas trabalhadas na semana (do ponto) ──────────────────────────
  const hoursByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of clockEntries) {
      if (!inScopeUser(e.user_id)) continue;
      map.set(e.user_id, (map.get(e.user_id) ?? 0) + entryMinutes(e));
    }
    return Array.from(map.entries())
      .map(([uid, minutes]) => ({
        uid,
        name: profileBy.get(uid)?.display_name || "Sem nome",
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [clockEntries, profileBy, scope, myUid]);

  const totalWeekMinutes = hoursByUser.reduce((acc, x) => acc + x.minutes, 0);

  // KPIs gerais
  const overallRoutinePct = useMemo(() => {
    const exp = sectorAdherence.reduce((a, s) => a + s.expected, 0);
    const dn = sectorAdherence.reduce((a, s) => a + s.done, 0);
    return exp ? Math.round((dn / exp) * 100) : 0;
  }, [sectorAdherence]);

  const activeMembers = useMemo(() => {
    const set = new Set(completions.filter((c) => inScopeUser(c.user_id)).map((c) => c.user_id));
    return set.size;
  }, [completions, scope, myUid]);

  return (
    <AppShell>
      <header className="mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <Calendar className="h-3.5 w-3.5" />
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Dashboard CRM</h1>
            <p className="text-muted-foreground mt-1">
              Período: <span className="text-foreground font-medium">{periodLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <PeriodFilter value={period} onChange={setPeriod} />
            {isAdmin && (
              <div className="inline-flex rounded-lg border border-border/60 p-0.5 bg-secondary/30">
                <Button
                  variant={scope === "all" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setScope("all")}
                  className="h-8 px-3 text-xs"
                >
                  Visão geral
                </Button>
                <Button
                  variant={scope === "me" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setScope("me")}
                  className="h-8 px-3 text-xs"
                >
                  Só eu
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <PriorityAlert />

      <Tabs defaultValue="geral" className="w-full mt-4">
        <TabsList className="mb-6">
          <TabsTrigger value="geral" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="clinica" className="gap-2">
            <Stethoscope className="h-4 w-4" />
            Clínica
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6 mt-0">
          {/* KPI nível CRM */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr">
            <KpiCard
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
              label="Aderência de rotina"
              value={`${overallRoutinePct}%`}
              hint={`período — ${scope === "all" ? "todos" : "você"}`}
            />
            <KpiCard
              icon={<ClipboardList className="h-4 w-4 text-primary" />}
              label="Tarefas com clientes"
              value={`${clientAdherence.pct}%`}
              hint={`${clientAdherence.done}/${clientAdherence.total} feitas`}
            />
            <KpiCard
              icon={<Clock className="h-4 w-4 text-primary" />}
              label="Horas no período"
              value={fmtMinutes(totalWeekMinutes)}
              hint={`${hoursByUser.length} pessoa(s) batendo ponto`}
            />
            <KpiCard
              icon={<Activity className="h-4 w-4 text-primary" />}
              label="Membros ativos"
              value={String(activeMembers)}
              hint="marcaram rotina nesta semana"
            />
          </div>

          {/* Aderência de Rotina por setor — TABELA */}
          <Card className="p-6 bg-gradient-card border-border/50">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Aderência de rotina</h2>
                <Badge variant="outline" className="text-[10px]">
                  {expectedWeekdays} dia(s) úteis
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">tempo real</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setor</TableHead>
                    <TableHead className="text-right">Tarefas</TableHead>
                    <TableHead className="text-right">Esperado no período</TableHead>
                    <TableHead className="text-right">Concluídas</TableHead>
                    <TableHead className="text-right">% Atingimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectorAdherence.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.tasksCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.expected}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.done}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full bg-gradient-primary"
                              style={{ width: `${Math.min(100, s.pct)}%` }}
                            />
                          </div>
                          <span className="tabular-nums font-semibold w-10 text-right">
                            {s.pct}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-border font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sectorAdherence.reduce((a, s) => a + s.tasksCount, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sectorAdherence.reduce((a, s) => a + s.expected, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sectorAdherence.reduce((a, s) => a + s.done, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{overallRoutinePct}%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Aderência de tarefas com clientes + Horas trabalhadas */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-6 bg-gradient-card border-border/50">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Aderência de tarefas com clientes</h2>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Mini label="Total" value={clientAdherence.total} />
                <Mini label="Feitas" value={clientAdherence.done} tone="success" />
                <Mini label="Atrasadas" value={clientAdherence.overdue} tone="destructive" />
              </div>
              <div className="h-3 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gradient-primary transition-all"
                  style={{ width: `${clientAdherence.pct}%` }}
                />
              </div>
              <div className="text-right text-sm font-semibold mt-2 tabular-nums">
                {clientAdherence.pct}%
              </div>
            </Card>

            <Card className="p-6 bg-gradient-card border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h2 className="text-lg font-semibold">Horas trabalhadas na semana</h2>
                </div>
                <Badge variant="outline" className="text-[10px]">do ponto</Badge>
              </div>
              {hoursByUser.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Sem registros de ponto na semana.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-auto">
                  {hoursByUser.map((u) => (
                    <div
                      key={u.uid}
                      className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2 bg-card/40"
                    >
                      <span className="text-sm font-medium truncate">
                        {u.name}
                        {u.uid === myUid && (
                          <span className="ml-1.5 text-xs text-primary">(você)</span>
                        )}
                      </span>
                      <span className="tabular-nums text-sm font-semibold">
                        {fmtMinutes(u.minutes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Atingimento de resultados (metas do mês) */}
          <Card className="p-1 bg-transparent border-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <Target className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Atingimento de resultados</h2>
            </div>
            <SectorResultsPanel
              defaultSectorId={profile?.sector_id ?? null}
              showSectorTabs={isAdmin && scope === "all"}
              title="Metas do mês"
            />
          </Card>

          {/* Tarefas dos colaboradores com cliente */}
          <CollaboratorTasksPanel />
        </TabsContent>

        <TabsContent value="clinica" className="mt-0">
          <ClinicDashboardTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-3 sm:p-5 bg-gradient-card border-border/50 min-w-0 overflow-hidden flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight break-words flex-1 min-w-0">
          {label}
        </span>
        <span className="shrink-0">{icon}</span>
      </div>
      <div className="text-xl sm:text-3xl font-bold tabular-nums leading-tight break-words">
        {value}
      </div>
      {hint && (
        <div className="text-[11px] sm:text-xs text-muted-foreground mt-1 leading-snug break-words">
          {hint}
        </div>
      )}
    </Card>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "destructive";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-lg bg-secondary/30 border border-border/30 p-2 sm:p-3 text-center min-w-0 overflow-hidden">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight break-words">
        {label}
      </div>
      <div className={`text-lg sm:text-2xl font-bold tabular-nums mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}
