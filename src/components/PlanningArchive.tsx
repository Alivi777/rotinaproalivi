import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import PeriodFilter, { defaultPeriod, type PeriodValue } from "@/components/PeriodFilter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList, CalendarRange, Archive, Eye, FileDown } from "lucide-react";
import jsPDF from "jspdf";

type DailyPlan = Record<string, any> & { id: string; plan_date: string; manager_id: string };
type WeeklyPlan = Record<string, any> & { id: string; week_start: string; manager_id: string };

function fmtDate(s: string) {
  return new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "2-digit",
  });
}

// Human-readable labels for fields
const DAILY_LABELS: Record<string, string> = {
  plan_date: "Data do plano",
  method: "Método",
  meeting_start: "Início da reunião",
  meeting_end: "Fim da reunião",
  meeting_duration_min: "Duração (min)",
  conducted_by: "Conduzido por",
  participant_1: "Participante 1",
  participant_2: "Participante 2",
  participant_3: "Participante 3",
  yesterday_main_mission: "Ontem — missão principal",
  yesterday_status: "Ontem — status",
  yesterday_advanced: "Ontem — o que avançou",
  yesterday_blocked: "Ontem — o que travou",
  yesterday_pending: "Ontem — pendências",
  today_fixed: "Hoje — compromissos fixos",
  today_urgencies: "Hoje — urgências",
  today_bottlenecks: "Hoje — gargalos",
  today_main_risk: "Hoje — principal risco",
  main_mission: "Missão principal",
  secondary_1: "Secundária 1",
  secondary_2: "Secundária 2",
  to_block: "Bloquear",
  to_delegate: "Delegar",
  not_today: "Não hoje",
  needs_support: "Precisa de apoio",
  pending_next: "Pendências para amanhã",
  notes: "Anotações",
};

const WEEKLY_LABELS: Record<string, string> = {
  week_start: "Início da semana",
  method: "Método",
  prev_what_worked: "Anterior — o que funcionou",
  prev_time_wasters: "Anterior — consumiu tempo",
  prev_excess_alignment: "Anterior — excesso de alinhamento",
  prev_excess_execution: "Anterior — execução sem alinhamento",
  prev_repeated_block: "Anterior — trava repetida",
  prev_single_correction: "Anterior — única correção",
  week_focus: "Foco da semana",
  fixed_commitments: "Compromissos fixos",
  not_this_week: "Não entra nesta semana",
  mission_blocks: "Blocos de missão",
  secondary_blocks: "Blocos secundários",
  ind_alignments_done: "Alinhamentos realizados",
  ind_meetings_under_31: "Reuniões ≤31min",
  ind_missions_done: "Missões concluídas",
  ind_blocks_protected: "Blocos protegidos",
  ind_tasks_delegated: "Tarefas delegadas",
  ind_tasks_eliminated: "Tarefas eliminadas",
  ind_days_tomorrow_defined: "Dias com amanhã definido",
  ind_interruptions: "Interrupções",
  classification: "Classificação",
  notes: "Anotações",
};

function exportPlanPdf(
  title: string,
  manager: string,
  labels: Record<string, string>,
  record: Record<string, any>,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Responsável: ${manager}`, margin, y);
  y += 18;

  const ensureRoom = (lines: number) => {
    if (y + lines * 12 > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  for (const key of Object.keys(labels)) {
    const value = record[key];
    if (value === null || value === undefined || value === "") continue;
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    const wrapped = doc.splitTextToSize(`${labels[key]}: ${text}`, maxWidth);
    ensureRoom(wrapped.length + 1);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(labels[key] + ":", margin, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    const valueLines = doc.splitTextToSize(text, maxWidth);
    for (const line of valueLines) {
      ensureRoom(1);
      doc.text(line, margin, y);
      y += 12;
    }
    y += 4;
  }

  doc.save(`${title.replace(/[^a-z0-9]+/gi, "_")}.pdf`);
}

export default function PlanningArchive() {
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod("month"));
  const [daily, setDaily] = useState<DailyPlan[]>([]);
  const [weekly, setWeekly] = useState<WeeklyPlan[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; display_name: string | null }[]>([]);
  const [open, setOpen] = useState<
    | { kind: "daily"; record: DailyPlan }
    | { kind: "weekly"; record: WeeklyPlan }
    | null
  >(null);

  useEffect(() => {
    supabase.from("profiles").select("user_id, display_name")
      .then(({ data }) => setProfiles(data ?? []));
  }, []);

  useEffect(() => {
    (async () => {
      const [d, w] = await Promise.all([
        supabase.from("manager_daily_plans")
          .select("*")
          .gte("plan_date", period.from).lte("plan_date", period.to)
          .order("plan_date", { ascending: false }),
        supabase.from("manager_weekly_plans")
          .select("*")
          .gte("week_start", period.from).lte("week_start", period.to)
          .order("week_start", { ascending: false }),
      ]);
      setDaily((d.data as DailyPlan[]) ?? []);
      setWeekly((w.data as WeeklyPlan[]) ?? []);
    })();
  }, [period.from, period.to]);

  const nameOf = (uid: string) =>
    profiles.find((p) => p.user_id === uid)?.display_name || "—";

  const dialogContent = useMemo(() => {
    if (!open) return null;
    const labels = open.kind === "daily" ? DAILY_LABELS : WEEKLY_LABELS;
    const rec = open.record;
    const title =
      open.kind === "daily"
        ? `Plano diário — ${fmtDate(rec.plan_date)}`
        : `Plano semanal — ${fmtDate(rec.week_start)}`;
    return { labels, rec, title };
  }, [open]);

  return (
    <Card className="p-6 bg-card border-border/50">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Histórico arquivado</h2>
          <Badge variant="outline" className="text-[10px]">
            {daily.length} diários · {weekly.length} semanais
          </Badge>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" /> Diários
          </TabsTrigger>
          <TabsTrigger value="weekly" className="gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" /> Semanais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-3">
          {daily.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem planos no período.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {daily.map((p) => (
                <li key={p.id} className="py-3 flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground w-24">
                        {fmtDate(p.plan_date)}
                      </span>
                      <span className="text-sm font-semibold">{nameOf(p.manager_id)}</span>
                    </div>
                    {p.main_mission && (
                      <p className="text-sm"><strong>Missão:</strong> {p.main_mission}</p>
                    )}
                    {p.today_main_risk && (
                      <p className="text-xs text-muted-foreground mt-1">⚠ {p.today_main_risk}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setOpen({ kind: "daily", record: p })}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Abrir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        exportPlanPdf(
                          `Plano diário — ${fmtDate(p.plan_date)}`,
                          nameOf(p.manager_id),
                          DAILY_LABELS,
                          p,
                        )
                      }
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="weekly" className="mt-3">
          {weekly.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem planos no período.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {weekly.map((p) => (
                <li key={p.id} className="py-3 flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground w-28">
                        Sem. {fmtDate(p.week_start)}
                      </span>
                      <span className="text-sm font-semibold">{nameOf(p.manager_id)}</span>
                      {p.classification && (
                        <Badge variant="secondary" className="text-[10px]">{p.classification}</Badge>
                      )}
                    </div>
                    {p.week_focus && (
                      <p className="text-sm"><strong>Foco:</strong> {p.week_focus}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setOpen({ kind: "weekly", record: p })}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Abrir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        exportPlanPdf(
                          `Plano semanal — ${fmtDate(p.week_start)}`,
                          nameOf(p.manager_id),
                          WEEKLY_LABELS,
                          p,
                        )
                      }
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {dialogContent && (
            <>
              <DialogHeader>
                <DialogTitle>{dialogContent.title}</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Responsável: {nameOf(dialogContent.rec.manager_id)}
                </p>
              </DialogHeader>
              <div className="space-y-3">
                {Object.entries(dialogContent.labels).map(([key, label]) => {
                  const value = dialogContent.rec[key];
                  if (value === null || value === undefined || value === "") return null;
                  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
                  return (
                    <div key={key} className="border-b border-border/30 pb-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
                      <div className="text-sm whitespace-pre-wrap">{text}</div>
                    </div>
                  );
                })}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    exportPlanPdf(
                      dialogContent.title,
                      nameOf(dialogContent.rec.manager_id),
                      dialogContent.labels,
                      dialogContent.rec,
                    )
                  }
                >
                  <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
