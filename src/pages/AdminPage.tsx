import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsAdmin } from "@/lib/useIsAdmin";
import {
  ShieldCheck,
  Target,
  CreditCard,
  Plus,
  Trash2,
  Save,
  TrendingUp,
  DollarSign,
  HeartPulse,
  Users,
  Lock,
  Crosshair,
  Stethoscope,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import TeamAdminPanel from "@/components/TeamAdminPanel";
import PrioritiesAdminPanel from "@/components/PrioritiesAdminPanel";
import WeeklyRankingPanel from "@/components/WeeklyRankingPanel";
import KanbanStagesAdminPanel from "@/components/KanbanStagesAdminPanel";
import DoctorsAdminPanel from "@/components/DoctorsAdminPanel";
import SectorMonthlyGoalsForm from "@/components/SectorMonthlyGoalsForm";

type Goal = {
  id: string;
  period_month: string;
  new_patients_target: number;
  new_clients_target: number;
  revenue_target: number;
  profit_target: number;
};

type PaymentMethod = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
};

type Sale = {
  id: string;
  amount: number;
  cost: number;
  profit: number;
  sale_date: string;
  is_new_patient: boolean;
  payment_method_id: string | null;
};

const monthStartIso = () => {
  // mês corrente no fuso de São Paulo (Brasil)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}-01`;
};
const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminPage() {
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [newClientsCount, setNewClientsCount] = useState(0);
  const [salesByMethod, setSalesByMethod] = useState<Record<string, number>>({});
  const [newMethodName, setNewMethodName] = useState("");
  const [saving, setSaving] = useState(false);

  // local edit state for goal
  const [pTarget, setPTarget] = useState("0");
  const [cTarget, setCTarget] = useState("0");
  const [revTarget, setRevTarget] = useState("0");
  const [profTarget, setProfTarget] = useState("0");

  const period = monthStartIso();

  async function load() {
    const monthStartDate = period;
    const [g, pm, s, nc] = await Promise.all([
      supabase.from("monthly_goals").select("*").eq("period_month", period).maybeSingle(),
      supabase.from("payment_methods").select("*").order("sort_order"),
      supabase.from("sales").select("*").gte("sale_date", monthStartDate),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .gte("created_at", `${monthStartDate}T00:00:00`),
    ]);

    if (g.data) {
      const goalData = g.data as Goal;
      setGoal(goalData);
      setPTarget(String(goalData.new_patients_target));
      setCTarget(String(goalData.new_clients_target));
      setRevTarget(String(goalData.revenue_target));
      setProfTarget(String(goalData.profit_target));
    } else {
      setGoal(null);
    }
    if (pm.data) setMethods(pm.data as PaymentMethod[]);
    if (s.data) {
      const salesData = s.data as Sale[];
      setSales(salesData);
      const grouped: Record<string, number> = {};
      for (const sale of salesData) {
        const key = sale.payment_method_id ?? "none";
        grouped[key] = (grouped[key] ?? 0) + Number(sale.amount);
      }
      setSalesByMethod(grouped);
    }
    setNewClientsCount(nc.count ?? 0);
  }

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const ch = supabase
      .channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function saveGoal() {
    setSaving(true);
    const payload = {
      period_month: period,
      new_patients_target: parseInt(pTarget) || 0,
      new_clients_target: parseInt(cTarget) || 0,
      revenue_target: parseFloat(revTarget) || 0,
      profit_target: parseFloat(profTarget) || 0,
    };
    const { error } = goal
      ? await supabase.from("monthly_goals").update(payload).eq("id", goal.id)
      : await supabase.from("monthly_goals").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Metas salvas!");
    load();
  }

  async function addMethod() {
    if (!newMethodName.trim()) return;
    const order = methods.length ? Math.max(...methods.map((m) => m.sort_order)) + 1 : 1;
    const { error } = await supabase
      .from("payment_methods")
      .insert({ name: newMethodName.trim(), sort_order: order });
    if (error) return toast.error(error.message);
    setNewMethodName("");
    toast.success("Forma de pagamento adicionada");
    load();
  }

  async function toggleMethod(id: string, active: boolean) {
    const { error } = await supabase.from("payment_methods").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function deleteMethod(id: string) {
    const { error } = await supabase.from("payment_methods").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  // Aggregates
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.amount), 0);
  const totalProfit = sales.reduce((sum, s) => sum + Number(s.profit), 0);
  const totalCost = sales.reduce((sum, s) => sum + Number(s.cost), 0);
  const newPatientsCount = sales.filter((s) => s.is_new_patient).length;
  const margin = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;

  const monthLabel = new Date(`${period}T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  if (roleLoading) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Carregando…</p>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <Card className="p-12 text-center bg-gradient-card border-border/50 max-w-lg mx-auto mt-12">
          <Lock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-xl font-bold mb-2">Acesso restrito</h2>
          <p className="text-muted-foreground text-sm">
            Esta área é exclusiva para administradores. Peça a um admin para conceder o papel ao
            seu usuário.
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="mb-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <ShieldCheck className="h-3.5 w-3.5" />
          Painel do administrador
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
          Metas & Financeiro · {monthLabel}
        </h1>
        <p className="text-muted-foreground mt-1">
          Acompanhe vendas, lucro e progresso vs meta do mês.
        </p>
      </header>

      {/* Progress rulers */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <ProgressRuler
          icon={<HeartPulse className="h-4 w-4" />}
          label="Novos pacientes"
          current={newPatientsCount}
          target={goal?.new_patients_target ?? 0}
          formatter={(v) => String(v)}
        />
        <ProgressRuler
          icon={<Users className="h-4 w-4" />}
          label="Novos clientes"
          current={newClientsCount}
          target={goal?.new_clients_target ?? 0}
          formatter={(v) => String(v)}
        />
        <ProgressRuler
          icon={<DollarSign className="h-4 w-4" />}
          label="Faturamento"
          current={totalRevenue}
          target={Number(goal?.revenue_target ?? 0)}
          formatter={fmtMoney}
        />
        <ProgressRuler
          icon={<TrendingUp className="h-4 w-4" />}
          label="Lucro"
          current={totalProfit}
          target={Number(goal?.profit_target ?? 0)}
          formatter={fmtMoney}
          subtitle={`Margem: ${margin.toFixed(1)}% · Custo: ${fmtMoney(totalCost)}`}
        />
      </div>

      <div className="mb-8">
        <WeeklyRankingPanel />
      </div>

      <Tabs defaultValue="team">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="team">
            <Users className="h-4 w-4 mr-1.5" /> Equipe
          </TabsTrigger>
          <TabsTrigger value="priorities">
            <Crosshair className="h-4 w-4 mr-1.5" /> Prioridades
          </TabsTrigger>
          <TabsTrigger value="goals">
            <Target className="h-4 w-4 mr-1.5" /> Metas
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="h-4 w-4 mr-1.5" /> Formas de pagamento
          </TabsTrigger>
          <TabsTrigger value="breakdown">
            <DollarSign className="h-4 w-4 mr-1.5" /> Mix de pagamento
          </TabsTrigger>
          <TabsTrigger value="kanban">
            <Users className="h-4 w-4 mr-1.5" /> Kanban
          </TabsTrigger>
          <TabsTrigger value="doctors">
            <Stethoscope className="h-4 w-4 mr-1.5" /> Delegação por doutor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="doctors" className="mt-4">
          <DoctorsAdminPanel />
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          <KanbanStagesAdminPanel />
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <TeamAdminPanel />
        </TabsContent>

        <TabsContent value="priorities" className="mt-4">
          <PrioritiesAdminPanel />
        </TabsContent>

        <TabsContent value="goals" className="mt-4">
          <Card className="p-6 bg-card border-border/50 space-y-5 max-w-3xl">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Meta de novos pacientes (mês)</Label>
                <Input
                  type="number"
                  min={0}
                  value={pTarget}
                  onChange={(e) => setPTarget(e.target.value)}
                />
              </div>
              <div>
                <Label>Meta de novos clientes (mês)</Label>
                <Input
                  type="number"
                  min={0}
                  value={cTarget}
                  onChange={(e) => setCTarget(e.target.value)}
                />
              </div>
              <div>
                <Label>Meta de faturamento (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={revTarget}
                  onChange={(e) => setRevTarget(e.target.value)}
                />
              </div>
              <div>
                <Label>Meta de lucro (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={profTarget}
                  onChange={(e) => setProfTarget(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={saveGoal} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Salvando..." : "Salvar metas do mês"}
            </Button>
          </Card>

          <div className="mt-6">
            <SectorMonthlyGoalsForm />
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card className="p-6 bg-card border-border/50 max-w-2xl">
            <div className="flex gap-2 mb-5">
              <Input
                placeholder="Nova forma de pagamento (ex: Cartão parcelado)"
                value={newMethodName}
                onChange={(e) => setNewMethodName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMethod()}
              />
              <Button onClick={addMethod}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ul className="divide-y divide-border/50">
              {methods.map((m) => (
                <li key={m.id} className="py-3 flex items-center gap-4">
                  <span className="flex-1 font-medium">{m.name}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{m.active ? "Ativa" : "Inativa"}</span>
                    <Switch
                      checked={m.active}
                      onCheckedChange={(v) => toggleMethod(m.id, v)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMethod(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="mt-4">
          <Card className="p-6 bg-card border-border/50 max-w-3xl">
            <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground">
              Faturamento por forma de pagamento — {monthLabel}
            </h3>
            <div className="space-y-3">
              {methods.map((m) => {
                const value = salesByMethod[m.id] ?? 0;
                const pct = totalRevenue ? (value / totalRevenue) * 100 : 0;
                return (
                  <div key={m.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {fmtMoney(value)} · {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-gradient-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {salesByMethod["none"] && (
                <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                  Vendas sem forma definida: {fmtMoney(salesByMethod["none"])}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ProgressRuler({
  icon,
  label,
  current,
  target,
  formatter,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  target: number;
  formatter: (v: number) => string;
  subtitle?: string;
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const isOver = target > 0 && current >= target;
  const noTarget = target === 0;

  // expected pct based on day of month (linear pace)
  const day = new Date().getDate();
  const monthDays = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0
  ).getDate();
  const expectedPct = (day / monthDays) * 100;
  const onPace = target > 0 && (current / target) * 100 >= expectedPct;

  return (
    <Card className="p-5 bg-gradient-card border-border/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="text-primary">{icon}</span>
          {label}
        </div>
        {!noTarget && (
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
              isOver
                ? "bg-success/20 text-success"
                : onPace
                ? "bg-primary/15 text-primary"
                : "bg-warning/15 text-warning"
            )}
          >
            {isOver ? "Meta batida" : onPace ? "No ritmo" : "Abaixo do ritmo"}
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between mt-1 mb-3">
        <span className="text-2xl font-bold tabular-nums">{formatter(current)}</span>
        <span className="text-xs text-muted-foreground">
          {noTarget ? "sem meta definida" : `de ${formatter(target)}`}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-700",
            isOver ? "bg-success" : "bg-gradient-primary"
          )}
          style={{ width: `${pct}%` }}
        />
        {!noTarget && (
          <div
            className="absolute top-0 bottom-0 w-px bg-foreground/40"
            style={{ left: `${expectedPct}%` }}
            title={`Ritmo esperado: ${expectedPct.toFixed(0)}%`}
          />
        )}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
        <span>{pct.toFixed(0)}%</span>
        {!noTarget && <span>Esperado: {expectedPct.toFixed(0)}%</span>}
      </div>
      {subtitle && (
        <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
          {subtitle}
        </div>
      )}
    </Card>
  );
}
