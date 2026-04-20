import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { useSectors } from "@/lib/useProfile";
import {
  CheckCircle2,
  MessageSquareText,
  UserPlus,
  Calendar,
  TrendingUp,
  Activity,
} from "lucide-react";
import { Link } from "react-router-dom";

const todayStr = () => new Date().toISOString().slice(0, 10);
const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

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
  const [waToday, setWaToday] = useState(0);
  const [uniqueClients, setUniqueClients] = useState(0);
  const [newClients, setNewClients] = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);
  const today = todayStr();

  async function load() {
    const dayStart = startOfDay();
    const [t, c, wa, nc, am] = await Promise.all([
      supabase.from("routine_tasks").select("id, sector_id").eq("active", true),
      supabase.from("task_completions").select("task_id, user_id").eq("completion_date", today),
      supabase
        .from("whatsapp_messages")
        .select("from_phone, client_id", { count: "exact" })
        .gte("received_at", dayStart),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayStart),
      supabase
        .from("task_completions")
        .select("user_id")
        .eq("completion_date", today),
    ]);
    if (t.data) setTasks(t.data);
    if (c.data) setCompletions(c.data);
    if (wa.data) {
      setWaToday(wa.count ?? wa.data.length);
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
  }, []);

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

  return (
    <AppShell>
      <header className="mb-8">
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
          Visão consolidada do dia em todos os setores.
        </p>
      </header>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          label="Aderência geral"
          value={`${orgPct}%`}
          hint={`${distinctDone}/${totalTasks} tarefas`}
        />
        <KpiCard
          icon={<MessageSquareText className="h-4 w-4 text-primary" />}
          label="Atendimentos WhatsApp"
          value={String(waToday)}
          hint={`${uniqueClients} contatos únicos`}
        />
        <KpiCard
          icon={<UserPlus className="h-4 w-4 text-primary" />}
          label="Novos clientes"
          value={String(newClients)}
          hint="cadastrados hoje"
        />
        <KpiCard
          icon={<Activity className="h-4 w-4 text-primary" />}
          label="Membros ativos"
          value={String(activeMembers)}
          hint={`${totalDoneRecords} marcações totais`}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
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
