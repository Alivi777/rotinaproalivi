import AppShell from "@/components/AppShell";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { ClipboardList, CalendarRange, Lock, BookOpen, Target, Archive } from "lucide-react";
import DailyPlanForm from "@/components/DailyPlanForm";
import WeeklyPlanForm from "@/components/WeeklyPlanForm";
import StandardAgendaCard from "@/components/StandardAgendaCard";
import SectorMonthlyGoalsForm from "@/components/SectorMonthlyGoalsForm";
import SectorResultsPanel from "@/components/SectorResultsPanel";
import PlanningArchive from "@/components/PlanningArchive";

export default function PlanningPage() {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <Card className="p-8 text-center bg-card border-border/50">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-semibold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Esta área é exclusiva para gestores.
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="mb-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <ClipboardList className="h-3.5 w-3.5" />
          Método tático & operacional · Planejamento do gestor
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Planejamento</h1>
        <p className="text-muted-foreground mt-1">
          Revise ontem, alinhe hoje, defina a semana. Distribua missão + 2 secundárias por pessoa do time.
        </p>
      </header>

      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="daily">
            <ClipboardList className="h-4 w-4 mr-1" /> Plano do dia / Ata
          </TabsTrigger>
          <TabsTrigger value="weekly">
            <CalendarRange className="h-4 w-4 mr-1" /> Plano semanal
          </TabsTrigger>
          <TabsTrigger value="agenda">
            <BookOpen className="h-4 w-4 mr-1" /> Agenda padrão
          </TabsTrigger>
          <TabsTrigger value="metas">
            <Target className="h-4 w-4 mr-1" /> Metas e resultados do mês
          </TabsTrigger>
          <TabsTrigger value="archive">
            <Archive className="h-4 w-4 mr-1" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <p className="text-sm">
              <strong>Lógica-mãe:</strong> revisar ontem → alinhar hoje → executar missão principal → avançar nas secundárias → fechar o dia e preparar amanhã.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Reunião máxima: 31 min · Meta em dias limpos: 15 min · Cada pessoa fala até 5 min total · Formato: fato → trava → necessidade ou decisão.
            </p>
          </Card>
          <DailyPlanForm />
        </TabsContent>

        <TabsContent value="weekly" className="space-y-4">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <p className="text-sm">
              <strong>Ritual semanal — 70 min:</strong> 31 min revisão · 4 min pausa · 31 min definição · 4 min fechamento. Sexta tem revisão de 35 min com <em>uma única correção prática</em> para a semana seguinte.
            </p>
          </Card>
          <WeeklyPlanForm />
        </TabsContent>

        <TabsContent value="agenda">
          <StandardAgendaCard />
        </TabsContent>

        <TabsContent value="metas" className="space-y-4">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <p className="text-sm">
              <strong>Metas mensais por setor:</strong> defina aqui os indicadores e metas. Os valores aparecem na rotina e nas prioridades de cada colaborador. Indicadores com fonte automática puxam do banco; os demais são preenchidos manualmente.
            </p>
          </Card>
          <SectorMonthlyGoalsForm />
          <SectorResultsPanel title="Pré-visualização — resultados do mês" />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
