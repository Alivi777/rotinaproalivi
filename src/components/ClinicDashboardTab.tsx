import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Stethoscope, CalendarDays, ClipboardList, TrendingUp, Activity } from "lucide-react";

type DoctorRow = { id: string; name: string; color: string | null; active: boolean };
type ApptRow = { id: string; doctor_id: string | null; appointment_at: string };
type TaskRow = { id: string; doctor_id: string | null; status: string; task_date: string };
type RoutineRow = { id: string; sector_id: string | null };
type SectorRow = { id: string; slug: string; name: string };

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
    const dow = d.getDay();
    if (dow !== 0) count++; // exclui domingo
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function elapsedBusinessDays(ref = new Date()) {
  const { start } = monthRange(ref);
  let count = 0;
  const d = new Date(start);
  while (d <= ref) {
    const dow = d.getDay();
    if (dow !== 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(count, 1);
}

export default function ClinicDashboardTab() {
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [appts, setAppts] = useState<ApptRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [completionsToday, setCompletionsToday] = useState<{ task_id: string }[]>([]);

  async function load() {
    const { start, end } = monthRange();
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const [d, a, t, r, s, c] = await Promise.all([
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
      supabase.from("routine_tasks").select("id, sector_id").eq("active", true),
      supabase.from("sectors").select("id, slug, name"),
      supabase.from("task_completions").select("task_id").eq("completion_date", today),
    ]);
    if (d.data) setDoctors(d.data as DoctorRow[]);
    if (a.data) setAppts(a.data as ApptRow[]);
    if (t.data) setTasks(t.data as TaskRow[]);
    if (r.data) setRoutines(r.data as RoutineRow[]);
    if (s.data) setSectors(s.data as SectorRow[]);
    if (c.data) setCompletionsToday(c.data);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("dash-clinic-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_appointments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_daily_tasks" }, load)
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

  // Recepção: tarefas clínicas (todas) + rotinas do setor recepção × dias úteis
  const totalClinicTasks = tasks.length;
  const doneClinicTasks = tasks.filter((t) => t.status === "done").length;
  const pendingClinicTasks = totalClinicTasks - doneClinicTasks;

  const recepSector = sectors.find(
    (s) => s.slug.toLowerCase().includes("recep") || s.name.toLowerCase().includes("recep"),
  );
  const recepRoutines = recepSector
    ? routines.filter((r) => r.sector_id === recepSector.id).length
    : 0;
  const monthlyRoutineLoad = recepRoutines * totalBusinessDays;
  const totalReceptionMonth = monthlyRoutineLoad + totalClinicTasks;

  const totalAppts = appts.length;
  const overallDailyAvg = totalAppts / Math.max(elapsed, 1);
  const projectionTotal = overallDailyAvg * totalBusinessDays;

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
          label="Tarefas recepção (mês)"
          value={String(totalReceptionMonth)}
          hint={`${monthlyRoutineLoad} rotinas + ${totalClinicTasks} clínicas`}
        />
        <KpiCard
          icon={<Activity className="h-4 w-4 text-primary" />}
          label="Pendentes clínicas"
          value={String(pendingClinicTasks)}
          hint={`${doneClinicTasks} concluídas`}
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
                    {doneClinicTasks}/{totalClinicTasks}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recepção breakdown */}
      <Card className="p-6 bg-gradient-card border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Carga de trabalho — Recepção (mês)</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <BreakdownTile
            label="Rotinas mensais"
            value={monthlyRoutineLoad}
            hint={`${recepRoutines} tarefas/dia × ${totalBusinessDays} dias`}
          />
          <BreakdownTile
            label="Atividades clínicas"
            value={totalClinicTasks}
            hint={`${doneClinicTasks} feitas · ${pendingClinicTasks} pendentes`}
          />
          <BreakdownTile
            label="Total no mês"
            value={totalReceptionMonth}
            hint="rotinas + clínicas"
            highlight
          />
        </div>
        <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
          Concluído hoje (rotinas): <span className="font-semibold text-foreground tabular-nums">{completionsToday.length}</span>
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
