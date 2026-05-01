import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSectors } from "@/lib/useProfile";
import WeeklyAdherenceChart from "@/components/WeeklyAdherenceChart";
import PriorityAlert from "@/components/PriorityAlert";
import WhatsAppTimeDashboard from "@/components/WhatsAppTimeDashboard";
import ClinicDashboardTab from "@/components/ClinicDashboardTab";
import ProductivityPanel from "@/components/ProductivityPanel";
import CollaboratorTasksPanel from "@/components/CollaboratorTasksPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { spToday, spWeekStart, spMonthStart } from "@/lib/spTime";
import {
  CheckCircle2,
  MessageSquareText,
  UserPlus,
  Calendar,
  TrendingUp,
  Activity,
  LayoutDashboard,
  Stethoscope,
  Filter,
} from "lucide-react";
import { Link } from "react-router-dom";

type RangeKey = "today" | "week" | "month" | "custom";

function resolveRange(r: RangeKey, custom: { start: string; end: string }) {
  const today = spToday();
  switch (r) {
    case "today":
      return { start: today, end: today };
    case "week":
      return { start: spWeekStart(), end: today };
    case "month":
      return { start: spMonthStart(), end: today };
    case "custom":
      return { start: custom.start || today, end: custom.end || today };
  }
}

type SectorAgg = {
  id: string;
  name: string;
  done: number;
  total: number;
  pct: number;
};

export default function DashboardPage() {
  const { sectors } = useSectors();
  const [tasks, setTasks] = useState<{ id: string; sector_id: string | null }[]>([]);
  const [completions, setCompletions] = useState<{ task_id: string; user_id: string }[]>([]);
  const [waCount, setWaCount] = useState(0);
  const [uniqueClients, setUniqueClients] = useState(0);
  const [newClients, setNewClients] = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);

  // Filtro de período — padrão "week" para alimentar dados da semana
  const [rangeKey, setRangeKey] = useState<RangeKey>("week");
  const [custom, setCustom] = useState({ start: spWeekStart(), end: spToday() });
  const { start, end } = useMemo(
    () => resolveRange(rangeKey, custom),
    [rangeKey, custom.start, custom.end]
  );

  async function load() {
    const startISO = `${start}T00:00:00-03:00`;
    const endISO = `${end}T23:59:59-03:00`;
    const [t, c, wa, nc, am] = await Promise.all([
      supabase.from("routine_tasks").select("id, sector_id").eq("active", true),
      supabase
        .from("task_completions")
        .select("task_id, user_id")
        .gte("completion_date", start)
        .lte("completion_date", end),
      supabase
        .from("whatsapp_messages")
        .select("from_phone, client_id", { count: "exact" })
        .gte("received_at", startISO)
        .lte("received_at", endISO),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startISO)
        .lte("created_at", endISO),
      supabase
        .from("task_completions")
        .select("user_id")
        .gte("completion_date", start)
        .lte("completion_date", end),
    ]);
    if (t.data) setTasks(t.data);
    if (c.data) setCompletions(c.data);
    if (wa.data) {
      setWaCount(wa.count ?? wa.data.length);
      const uniq = new Set(wa.data.map((m) => m.from_phone));
      setUniqueClients(uniq.size);
    }
    setNewClients(nc.count ?? 0);
    if (am.data) setActiveMembers(new Set(am.data.map((c) => c.user_id)).size);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("dash-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_completions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const totalTasks = tasks.length;
  const totalDoneRecords = completions.length;
  // Distinct done tasks (any user marked) for org-wide progress
  const distinctDone = new Set(completions.map((c) => c.task_id)).size;
  const orgPct = totalTasks ? Math.round((distinctDone / totalTasks) * 100) : 0;

  const perSector: SectorAgg[] = sectors.map((s) => {
    const sTasks = tasks.filter((t) => t.sector_id === s.id);
    const sDone = new Set(
      completions
        .filter((c) => sTasks.some((t) => t.id === c.task_id))
        .map((c) => c.task_id)
    ).size;
    return {
      id: s.id,
      name: s.name,
      done: sDone,
      total: sTasks.length,
      pct: sTasks.length ? Math.round((sDone / sTasks.length) * 100) : 0,
    };
  });

  const rangeLabel: Record<RangeKey, string> = {
    today: "Hoje",
    week: "Esta semana",
    month: "Este mês",
    custom: "Personalizado",
  };

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
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Visão consolidada — período: <span className="text-foreground font-medium">{rangeLabel[rangeKey]}</span>
          {" "}({start} → {end})
        </p>
      </header>

      {/* Filtro global de período */}
      <Card className="p-4 mb-6 bg-card border-border/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Filtrar período</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-border/60 p-0.5 bg-secondary/30">
              {(["today", "week", "month", "custom"] as RangeKey[]).map((r) => (
                <Button
                  key={r}
                  variant={rangeKey === r ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setRangeKey(r)}
                  className="h-8 px-3 text-xs"
                >
                  {rangeLabel[r]}
                </Button>
              ))}
            </div>
            {rangeKey === "custom" && (
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-xs">De</Label>
                  <Input
                    type="date"
                    value={custom.start}
                    onChange={(e) => setCustom({ ...custom, start: e.target.value })}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input
                    type="date"
                    value={custom.end}
                    onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                    className="h-8"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <PriorityAlert />

      <Tabs defaultValue="geral" className="w-full">
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
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
              label="Aderência geral"
              value={`${orgPct}%`}
              hint={`${distinctDone}/${totalTasks} tarefas`}
            />
            <KpiCard
              icon={<MessageSquareText className="h-4 w-4 text-primary" />}
              label="Atendimentos WhatsApp"
              value={String(waCount)}
              hint={`${uniqueClients} contatos únicos`}
            />
            <KpiCard
              icon={<UserPlus className="h-4 w-4 text-primary" />}
              label="Novos clientes"
              value={String(newClients)}
              hint={`no período (${rangeLabel[rangeKey].toLowerCase()})`}
            />
            <KpiCard
              icon={<Activity className="h-4 w-4 text-primary" />}
              label="Membros ativos"
              value={String(activeMembers)}
              hint={`${totalDoneRecords} marcações totais`}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-6 bg-gradient-card border-border/50 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Aderência por setor</h2>
                <span className="text-xs text-muted-foreground">tempo real</span>
              </div>
              <div className="space-y-3">
                {perSector.map((s) => (
                  <div key={s.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.done}/{s.total} · {s.pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-gradient-primary transition-all duration-500"
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 bg-gradient-card border-border/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Agenda</h2>
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div className="text-center py-10">
                <Calendar className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Conexão com Google Agenda
                  <br />
                  <span className="text-xs">disponível em breve</span>
                </p>
              </div>
            </Card>
          </div>

          <CollaboratorTasksPanel />
          <ProductivityPanel compact />
          <WeeklyAdherenceChart />
          <WhatsAppTimeDashboard />

          <div className="grid md:grid-cols-3 gap-4">
            <QuickLink
              to="/rotina"
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Marcar rotina"
              desc="Acessar checklist do seu setor"
            />
            <QuickLink
              to="/whatsapp"
              icon={<MessageSquareText className="h-5 w-5" />}
              title="Entradas WhatsApp"
              desc="Ver mensagens recebidas hoje"
            />
            <QuickLink
              to="/relatorio"
              icon={<TrendingUp className="h-5 w-5" />}
              title="Relatório do dia"
              desc="Gerar e exportar fechamento"
            />
          </div>
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

function QuickLink({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link to={to}>
      <Card className="p-5 bg-card border-border/50 hover:border-primary/40 transition-smooth h-full group">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center group-hover:bg-primary/25 transition-smooth">
            {icon}
          </div>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-sm text-muted-foreground">{desc}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
