import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Stethoscope,
  CalendarDays,
  ClipboardList,
  TrendingUp,
  Activity,
  Users,
  UserCheck,
} from "lucide-react";

type DoctorRow = {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
  assigned_user_id: string | null;
};
type ApptRow = { id: string; doctor_id: string | null; appointment_at: string };
type TaskRow = {
  id: string;
  doctor_id: string | null;
  status: string;
  task_date: string;
  assigned_to: string | null;
  completed_by: string | null;
};
type ItemRow = {
  id: string;
  status: string;
  task_date: string;
  completed_by: string | null;
  completed_at: string | null;
  daily_task_id: string | null;
};
type ProfileRow = { user_id: string; display_name: string | null };

type Period = "today" | "week" | "month";

function monthRange(ref = new Date()) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function businessDaysInMonth(ref = new Date()) {
  const { start, end } = monthRange(ref);
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() !== 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function elapsedBusinessDays(ref = new Date()) {
  const { start } = monthRange(ref);
  let count = 0;
  const d = new Date(start);
  while (d <= ref) {
    if (d.getDay() !== 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(count, 1);
}

/** YYYY-MM-DD em SP. */
function spDateOnly(d = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

/** Início da semana (segunda) em SP. */
function spWeekStart(d = new Date()): string {
  const today = new Date(`${spDateOnly(d)}T12:00:00-03:00`);
  const dow = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
  today.setUTCDate(today.getUTCDate() - (dow - 1));
  return spDateOnly(today);
}

export default function ClinicDashboardTab() {
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [appts, setAppts] = useState<ApptRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [collaboratorFilter, setCollaboratorFilter] = useState<string>("all");

  async function load() {
    const { start, end } = monthRange();
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const [d, a, t, i, p] = await Promise.all([
      supabase
        .from("clinic_doctors")
        .select("id, name, color, active, assigned_user_id")
        .eq("active", true)
        .order("name"),
      supabase
        .from("clinic_appointments")
        .select("id, doctor_id, appointment_at")
        .gte("appointment_at", startISO)
        .lte("appointment_at", endISO),
      supabase
        .from("clinic_daily_tasks")
        .select("id, doctor_id, status, task_date, assigned_to, completed_by")
        .gte("task_date", startDate)
        .lte("task_date", endDate),
      supabase
        .from("client_task_items")
        .select("id, status, task_date, completed_by, completed_at, daily_task_id")
        .gte("task_date", startDate)
        .lte("task_date", endDate),
      supabase.from("profiles").select("user_id, display_name").eq("is_active", true),
    ]);
    if (d.data) setDoctors(d.data as DoctorRow[]);
    if (a.data) setAppts(a.data as ApptRow[]);
    if (t.data) setTasks(t.data as TaskRow[]);
    if (i.data) setItems(i.data as ItemRow[]);
    if (p.data) setProfiles(p.data as ProfileRow[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("dash-clinic-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_appointments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_daily_tasks" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_task_items" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalBusinessDays = businessDaysInMonth();
  const elapsed = elapsedBusinessDays();

  // Mapas auxiliares
  const profileName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.user_id, p.display_name || "Sem nome");
    return m;
  }, [profiles]);

  // doctor_id -> assigned_user_id (responsável padrão pelo doutor)
  const doctorOwner = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const d of doctors) m.set(d.id, d.assigned_user_id);
    return m;
  }, [doctors]);

  // daily_task_id -> resolved owner (assigned_to da task, ou owner do doutor)
  const taskOwner = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const t of tasks) {
      const owner = t.assigned_to || (t.doctor_id ? doctorOwner.get(t.doctor_id) ?? null : null);
      m.set(t.id, owner);
    }
    return m;
  }, [tasks, doctorOwner]);

  // Resolve "colaborador responsável" de um item: completed_by se houver,
  // senão herda da daily_task (assigned_to ou owner do doutor).
  function itemOwner(it: ItemRow): string | null {
    if (it.completed_by) return it.completed_by;
    if (it.daily_task_id) return taskOwner.get(it.daily_task_id) ?? null;
    return null;
  }

  const perDoctor = doctors
    .map((doc) => {
      const docAppts = appts.filter((a) => a.doctor_id === doc.id);
      const docTasks = tasks.filter((t) => t.doctor_id === doc.id);
      const doneTasks = docTasks.filter((t) => t.status === "done").length;
      const dailyAvg = docAppts.length / Math.max(elapsed, 1);
      const projection = dailyAvg * totalBusinessDays;
      return {
        ...doc,
        total: docAppts.length,
        dailyAvg,
        projection,
        tasks: docTasks.length,
        doneTasks,
        ownerName: doc.assigned_user_id ? profileName.get(doc.assigned_user_id) : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  const totalAppts = appts.length;
  const overallDailyAvg = totalAppts / Math.max(elapsed, 1);
  const projectionTotal = overallDailyAvg * totalBusinessDays;

  // ====== Recepção: contagem de tarefas (filtrável por período + colaborador) ======
  const today = spDateOnly();
  const weekStart = spWeekStart();

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      // período
      if (period === "today" && it.task_date !== today) return false;
      if (period === "week" && !(it.task_date >= weekStart && it.task_date <= today)) return false;

      // colaborador
      if (collaboratorFilter !== "all") {
        const owner = itemOwner(it);
        if (collaboratorFilter === "none") {
          if (owner) return false;
        } else if (owner !== collaboratorFilter) {
          return false;
        }
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, period, today, weekStart, collaboratorFilter, taskOwner]);

  const totalItems = filteredItems.length;
  const doneItems = filteredItems.filter((i) => i.status === "done").length;
  const pendingItems = totalItems - doneItems;
  const completionRate = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  // Colaboradores que aparecem como responsáveis (para popular o filtro)
  const collaboratorOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) {
      const o = t.assigned_to || (t.doctor_id ? doctorOwner.get(t.doctor_id) ?? null : null);
      if (o) ids.add(o);
    }
    for (const it of items) {
      const o = itemOwner(it);
      if (o) ids.add(o);
    }
    return Array.from(ids)
      .map((id) => ({ id, name: profileName.get(id) || "Sem nome" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, items, doctorOwner, profileName, taskOwner]);

  // Ranking mensal por colaborador (sempre o mês todo, independente do período)
  const perCollaboratorMonth = useMemo(() => {
    const map = new Map<
      string,
      { id: string | "none"; name: string; total: number; done: number; pending: number }
    >();
    for (const it of items) {
      const owner = itemOwner(it);
      const key = owner ?? "none";
      const name = owner ? profileName.get(owner) || "Sem nome" : "Sem responsável";
      const cur = map.get(key) || { id: key, name, total: 0, done: 0, pending: 0 };
      cur.total++;
      if (it.status === "done") cur.done++;
      else cur.pending++;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, profileName, taskOwner]);

  const monthDoneTotal = items.filter((i) => i.status === "done").length;
  const monthPendingTotal = items.filter((i) => i.status === "pending").length;
  const monthAllTotal = items.length;

  const periodLabel: Record<Period, string> = {
    today: "Hoje",
    week: "Esta semana",
    month: "Este mês",
  };

  return (
    <div className="space-y-6">
      {/* KPIs gerais clínica */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<CalendarDays className="h-4 w-4 text-primary" />}
          label="Agendamentos no mês"
          value={String(totalAppts)}
          hint={`projeção ${Math.round(projectionTotal)}`}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          label="Média diária"
          value={overallDailyAvg.toFixed(1)}
          hint={`em ${elapsed} dias úteis`}
        />
        <KpiCard
          icon={<ClipboardList className="h-4 w-4 text-primary" />}
          label="Tarefas concluídas (mês)"
          value={String(monthDoneTotal)}
          hint={`de ${monthAllTotal} totais`}
        />
        <KpiCard
          icon={<Activity className="h-4 w-4 text-primary" />}
          label="Pendentes (mês)"
          value={String(monthPendingTotal)}
          hint={`${Math.round((monthDoneTotal / Math.max(monthAllTotal, 1)) * 100)}% concluídas`}
        />
      </div>

      {/* Por profissional */}
      <Card className="p-6 bg-gradient-card border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Corpo clínico — agenda do mês</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {totalBusinessDays} dias úteis previstos
          </span>
        </div>

        {perDoctor.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhum profissional ativo. Sincronize a agenda do Clinicorp.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  <th className="py-2 pr-4">Profissional</th>
                  <th className="py-2 px-2">Responsável</th>
                  <th className="py-2 px-2 text-right">Agendamentos</th>
                  <th className="py-2 px-2 text-right">Média/dia</th>
                  <th className="py-2 px-2 text-right">Projeção mês</th>
                  <th className="py-2 px-2 text-right">Tarefas recepção</th>
                </tr>
              </thead>
              <tbody>
                {perDoctor.map((d) => (
                  <tr key={d.id} className="border-b border-border/30 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full inline-block"
                          style={{ background: d.color || "hsl(var(--primary))" }}
                        />
                        <span className="font-medium">{d.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-xs text-muted-foreground">
                      {d.ownerName ?? <span className="italic">— não definido</span>}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums font-semibold">
                      {d.total}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-muted-foreground">
                      {d.dailyAvg.toFixed(1)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">
                      <span className="text-primary font-medium">
                        {Math.round(d.projection)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-muted-foreground">
                      {d.doneTasks}/{d.tasks}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-secondary/30">
                  <td className="py-3 pr-4 font-bold">Total</td>
                  <td className="py-3 px-2"></td>
                  <td className="py-3 px-2 text-right tabular-nums font-bold">
                    {totalAppts}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums font-bold">
                    {overallDailyAvg.toFixed(1)}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums font-bold text-primary">
                    {Math.round(projectionTotal)}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums font-bold">
                    {tasks.filter((t) => t.status === "done").length}/{tasks.length}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Contagem de tarefas — total e por usuário */}
      <Card className="p-6 bg-gradient-card border-border/50">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Tarefas da Recepção</h2>
              <p className="text-xs text-muted-foreground">
                Filtre por período e colaborador. O responsável é herdado do doutor quando a tarefa não foi concluída.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={collaboratorFilter} onValueChange={setCollaboratorFilter}>
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue placeholder="Colaborador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os colaboradores</SelectItem>
                <SelectItem value="none">Sem responsável</SelectItem>
                {collaboratorOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="inline-flex rounded-lg border border-border/60 p-0.5 bg-secondary/30">
              {(["today", "week", "month"] as Period[]).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPeriod(p)}
                  className="h-7 px-3 text-xs"
                >
                  {periodLabel[p]}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          <BreakdownTile label="Total no período" value={totalItems} hint={periodLabel[period]} />
          <BreakdownTile
            label="Concluídas"
            value={doneItems}
            hint={`${completionRate}% do total`}
            highlight
          />
          <BreakdownTile
            label="Pendentes"
            value={pendingItems}
            hint={pendingItems > 0 ? "Aguardando execução" : "Tudo em dia"}
          />
        </div>
      </Card>

      {/* Ranking mensal por colaborador (sempre todas as tarefas do mês) */}
      <Card className="p-6 bg-gradient-card border-border/50">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">
                Tarefas do mês por colaborador
              </h2>
              <p className="text-xs text-muted-foreground">
                Todas as tarefas do mês atual, agrupadas pelo responsável (colaborador do doutor ou quem concluiu).
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            Total mês: <span className="font-semibold text-foreground">{monthAllTotal}</span>
          </span>
        </div>

        {perCollaboratorMonth.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma tarefa registrada no mês.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  <th className="py-2 pr-4">Colaborador</th>
                  <th className="py-2 px-2 text-right">Total</th>
                  <th className="py-2 px-2 text-right">Concluídas</th>
                  <th className="py-2 px-2 text-right">Pendentes</th>
                  <th className="py-2 px-2 text-right">% conclusão</th>
                  <th className="py-2 pl-2 w-40">Progresso</th>
                </tr>
              </thead>
              <tbody>
                {perCollaboratorMonth.map((c) => {
                  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                  return (
                    <tr key={c.id} className="border-b border-border/30 last:border-0">
                      <td className="py-3 pr-4 font-medium">
                        {c.id === "none" ? (
                          <span className="italic text-muted-foreground">{c.name}</span>
                        ) : (
                          c.name
                        )}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums font-semibold">
                        {c.total}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums text-primary">
                        {c.done}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums text-muted-foreground">
                        {c.pending}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums">{pct}%</td>
                      <td className="py-3 pl-2">
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full bg-gradient-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
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
    <Card className="p-5 bg-gradient-card border-border/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {icon}
      </div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

function BreakdownTile({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: number;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-lg border ${
        highlight
          ? "bg-primary/10 border-primary/30"
          : "bg-secondary/40 border-border/50"
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${highlight ? "text-primary" : ""}`}>
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
