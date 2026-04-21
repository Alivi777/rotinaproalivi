import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Stethoscope,
  CalendarDays,
  ClipboardList,
  TrendingUp,
  Activity,
  ListChecks,
} from "lucide-react";

type DoctorRow = { id: string; name: string; color: string | null; active: boolean };
type ApptRow = { id: string; doctor_id: string | null; appointment_at: string };
type TaskRow = { id: string; doctor_id: string | null; status: string; task_date: string };
type ItemRow = {
  id: string;
  status: string;
  task_date: string;
  completed_by: string | null;
  completed_at: string | null;
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

  async function load() {
    const { start, end } = monthRange();
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const [d, a, t, i, p] = await Promise.all([
      supabase.from("clinic_doctors").select("id, name, color, active").eq("active", true).order("name"),
      supabase
        .from("clinic_appointments")
        .select("id, doctor_id, appointment_at")
        .gte("appointment_at", startISO)
        .lte("appointment_at", endISO),
      supabase
        .from("clinic_daily_tasks")
        .select("id, doctor_id, status, task_date")
        .gte("task_date", startDate)
        .lte("task_date", endDate),
      supabase
        .from("client_task_items")
        .select("id, status, task_date, completed_by, completed_at")
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
      };
    })
    .sort((a, b) => b.total - a.total);

  const totalAppts = appts.length;
  const overallDailyAvg = totalAppts / Math.max(elapsed, 1);
  const projectionTotal = overallDailyAvg * totalBusinessDays;

  // ====== Recepção: contagem de tarefas (filtrável) ======
  const today = spDateOnly();
  const weekStart = spWeekStart();

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (period === "today") return it.task_date === today;
      if (period === "week") return it.task_date >= weekStart && it.task_date <= today;
      return true; // month
    });
  }, [items, period, today, weekStart]);

  const totalItems = filteredItems.length;
  const doneItems = filteredItems.filter((i) => i.status === "done").length;
  const pendingItems = totalItems - doneItems;
  const completionRate = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  // (ranking removido a pedido — só contagens totais permanecem)

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
          value={String(items.filter((i) => i.status === "done").length)}
          hint={`de ${items.length} totais`}
        />
        <KpiCard
          icon={<Activity className="h-4 w-4 text-primary" />}
          label="Pendentes (mês)"
          value={String(items.filter((i) => i.status === "pending").length)}
          hint={`${Math.round((items.filter((i) => i.status === "done").length / Math.max(items.length, 1)) * 100)}% concluídas`}
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
                Filtre por período e veja totais e desempenho individual.
              </p>
            </div>
          </div>
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
