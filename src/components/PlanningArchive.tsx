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
type Assignment = Record<string, any> & { id: string };
type Deliverable = Record<string, any> & { id: string };

function fmtDate(s: string) {
  return new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "2-digit",
  });
}

// ----- Form structure mirrors -----

type Field = { key: string; label: string };
type Section = { title: string; fields: Field[]; cols?: 1 | 2 | 3 };

const DAILY_SECTIONS: Section[] = [
  {
    title: "Cabeçalho / Reunião",
    cols: 3,
    fields: [
      { key: "plan_date", label: "Data do plano" },
      { key: "method", label: "Método" },
      { key: "meeting_start", label: "Início da reunião" },
      { key: "meeting_end", label: "Término" },
      { key: "meeting_duration_min", label: "Duração (min)" },
      { key: "conducted_by", label: "Conduzido por" },
      { key: "participant_1", label: "Participante 1" },
      { key: "participant_2", label: "Participante 2" },
      { key: "participant_3", label: "Participante 3" },
    ],
  },
  {
    title: "1. Revisão de ontem",
    cols: 1,
    fields: [
      { key: "yesterday_main_mission", label: "Missão principal de ontem" },
      { key: "yesterday_status", label: "Status" },
      { key: "yesterday_advanced", label: "O que avançou de verdade" },
      { key: "yesterday_blocked", label: "O que travou" },
      { key: "yesterday_pending", label: "O que ficou pendente" },
    ],
  },
  {
    title: "2. Cenário do dia",
    cols: 2,
    fields: [
      { key: "today_fixed", label: "Compromissos fixos" },
      { key: "today_urgencies", label: "Urgências reais" },
      { key: "today_bottlenecks", label: "Gargalos / dependências" },
      { key: "today_main_risk", label: "Principal risco do dia" },
    ],
  },
  {
    title: "3. Definição do dia (gestor)",
    cols: 1,
    fields: [
      { key: "main_mission", label: "Missão principal de hoje" },
      { key: "secondary_1", label: "Prioridade secundária 1" },
      { key: "secondary_2", label: "Prioridade secundária 2" },
    ],
  },
  {
    title: "Proteção da execução",
    cols: 2,
    fields: [
      { key: "to_block", label: "O que precisa ser bloqueado hoje" },
      { key: "to_delegate", label: "O que pode ser delegado" },
      { key: "not_today", label: "O que NÃO entra hoje" },
      { key: "needs_support", label: "Quem precisa de apoio imediato" },
      { key: "pending_next", label: "Pendência que volta no próximo alinhamento" },
    ],
  },
  {
    title: "Anotações",
    cols: 1,
    fields: [{ key: "notes", label: "Anotações" }],
  },
];

const WEEKLY_SECTIONS: Section[] = [
  {
    title: "Cabeçalho",
    cols: 2,
    fields: [
      { key: "week_start", label: "Início da semana" },
      { key: "method", label: "Método" },
    ],
  },
  {
    title: "Revisão da semana anterior",
    cols: 2,
    fields: [
      { key: "prev_what_worked", label: "O que funcionou bem" },
      { key: "prev_time_wasters", label: "O que consumiu tempo sem gerar avanço" },
      { key: "prev_excess_alignment", label: "Excesso de alinhamento" },
      { key: "prev_excess_execution", label: "Execução sem alinhamento" },
      { key: "prev_repeated_block", label: "Trava que se repetiu" },
      { key: "prev_single_correction", label: "Única correção para a próxima semana" },
    ],
  },
  {
    title: "Definição da nova semana",
    cols: 2,
    fields: [
      { key: "week_focus", label: "O que realmente importa nesta semana" },
      { key: "fixed_commitments", label: "Compromissos fixos" },
      { key: "not_this_week", label: "O que NÃO entra nesta semana" },
      { key: "mission_blocks", label: "Dias com bloco de missão principal" },
      { key: "secondary_blocks", label: "Blocos para secundárias" },
    ],
  },
  {
    title: "Painel semanal de evolução",
    cols: 3,
    fields: [
      { key: "ind_alignments_done", label: "Alinhamentos realizados" },
      { key: "ind_meetings_under_31", label: "Reuniões ≤31 min" },
      { key: "ind_missions_done", label: "Missões concluídas" },
      { key: "ind_blocks_protected", label: "Blocos protegidos" },
      { key: "ind_tasks_delegated", label: "Tarefas delegadas" },
      { key: "ind_tasks_eliminated", label: "Tarefas eliminadas" },
      { key: "ind_days_tomorrow_defined", label: "Dias com amanhã definido" },
      { key: "ind_interruptions", label: "Interrupções" },
    ],
  },
  {
    title: "Classificação & anotações",
    cols: 1,
    fields: [
      { key: "classification", label: "Classificação da semana" },
      { key: "notes", label: "Anotações" },
    ],
  },
];

const OPENING = [
  "Analisou números, relatórios e indicadores na 1ª hora",
  "Revisou execuções, tarefas em aberto e bateu o funil",
  "Revisou a missão principal de ontem",
  "Identificou pendências abertas",
  "Identificou travas e gargalos",
  "Preparou o dia e definiu as próprias prioridades",
  "Delegou as prioridades do time",
  "Fez reunião de 10 min com cada membro para planejar e corrigir o dia",
  "Definiu donos e prazos",
  "Eliminou o que não entra no dia",
  "Ajustou a agenda real do time",
];
const DURING = [
  "Protegeu o bloco da missão principal",
  "Evitou interrupções desnecessárias",
  "Acompanhou travas críticas",
  "Delegou o que não precisava ficar na liderança",
  "Manteve resposta controlada, sem espalhar o foco",
  "Registrou desvios relevantes do plano",
];
const CLOSING = [
  "Conferiu o status da missão principal",
  "Conferiu o status das duas secundárias",
  "Registrou pendências abertas",
  "Definiu próximos responsáveis",
  "Deixou a missão preliminar de amanhã indicada",
  "Encerrou o dia com quadro atualizado",
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  done: "Concluído",
  blocked: "Travado",
};

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "plan_date" || key === "week_start" || key === "due_date") {
    try { return fmtDate(String(value)); } catch { return String(value); }
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ----- PDF builder mirroring form layout -----

function buildPlanPdf(args: {
  title: string;
  subtitle: string;
  sections: Section[];
  record: Record<string, any>;
  assignments?: Assignment[];
  deliverables?: Deliverable[];
  checklists?: { title: string; items: string[]; state: Record<string, boolean> }[];
  profilesById: Record<string, string>;
}) {
  const { title, subtitle, sections, record, assignments, deliverables, checklists, profilesById } = args;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Header
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 58, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, margin, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(subtitle, margin, 46);
  doc.setTextColor(20, 20, 20);
  y = 78;

  const drawSection = (sec: Section) => {
    // Section title bar
    ensure(28);
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 20, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(sec.title, margin + 8, y + 14);
    y += 26;

    const cols = sec.cols ?? 1;
    const gap = 10;
    const colWidth = (contentWidth - gap * (cols - 1)) / cols;
    let col = 0;
    let rowTop = y;
    let rowMaxBottom = y;

    for (const f of sec.fields) {
      const val = formatValue(f.key, record[f.key]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const labelLines = doc.splitTextToSize(f.label.toUpperCase(), colWidth - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const valueLines = doc.splitTextToSize(val, colWidth - 12);
      const boxHeight = 6 + labelLines.length * 10 + 4 + valueLines.length * 12 + 6;

      // If current row would overflow page, push to next page
      if (rowTop + boxHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
        rowTop = y;
        rowMaxBottom = y;
        col = 0;
      }

      const x = margin + col * (colWidth + gap);
      // Card
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, rowTop, colWidth, boxHeight, 2, 2, "S");

      // Label
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      let ty = rowTop + 12;
      for (const l of labelLines) {
        doc.text(l, x + 8, ty);
        ty += 10;
      }
      // Value
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      ty += 2;
      for (const l of valueLines) {
        doc.text(l, x + 8, ty);
        ty += 12;
      }

      const bottom = rowTop + boxHeight;
      if (bottom > rowMaxBottom) rowMaxBottom = bottom;
      col += 1;
      if (col >= cols) {
        col = 0;
        rowTop = rowMaxBottom + gap;
        y = rowTop;
        rowMaxBottom = rowTop;
      }
    }
    if (col !== 0) {
      y = rowMaxBottom + gap;
    } else {
      y = rowTop;
    }
    y += 6;
    doc.setTextColor(20, 20, 20);
  };

  for (const sec of sections) drawSection(sec);

  // Assignments table
  if (assignments && assignments.length) {
    ensure(28);
    doc.setFillColor(238, 242, 255);
    doc.setDrawColor(199, 210, 254);
    doc.roundedRect(margin, y, contentWidth, 20, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(49, 46, 129);
    doc.text("3 prioridades por pessoa do time", margin + 8, y + 14);
    y += 26;
    doc.setTextColor(20, 20, 20);

    for (const a of assignments) {
      const name = profilesById[a.assignee_id] || "—";
      const lines: { l: string; v: string }[] = [
        { l: "Colaborador", v: name },
        { l: "Missão principal", v: a.main_mission || "—" },
        { l: "Secundária 1", v: a.secondary_1 || "—" },
        { l: "Secundária 2", v: a.secondary_2 || "—" },
      ];
      if (a.observation) lines.push({ l: "Observação", v: a.observation });

      const wrapped = lines.map((x) => ({
        ...x,
        ls: doc.splitTextToSize(`${x.l}: ${x.v}`, contentWidth - 16),
      }));
      const total = wrapped.reduce((s, x) => s + x.ls.length * 11, 0) + 12;
      ensure(total + 6);

      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, total, 2, 2, "S");
      let ly = y + 14;
      for (const w of wrapped) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(w.l + ":", margin + 8, ly);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        const valOnly = doc.splitTextToSize(w.v, contentWidth - 16 - 90);
        for (let i = 0; i < valOnly.length; i++) {
          doc.text(valOnly[i], margin + 8 + 90, ly + i * 11);
        }
        ly += Math.max(11, valOnly.length * 11);
      }
      y += total + 6;
    }
    y += 6;
  }

  // Deliverables table
  if (deliverables && deliverables.length) {
    ensure(28);
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(margin, y, contentWidth, 20, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 83, 45);
    doc.text("Entregas, donos e prazos", margin + 8, y + 14);
    y += 26;
    doc.setTextColor(20, 20, 20);

    const cols = [
      { label: "✓", w: 22 },
      { label: "Entrega", w: contentWidth - 22 - 110 - 70 - 80 },
      { label: "Responsável", w: 110 },
      { label: "Prazo", w: 70 },
      { label: "Status", w: 80 },
    ];

    // header row
    ensure(20);
    doc.setFillColor(247, 250, 252);
    let x = margin;
    doc.rect(margin, y, contentWidth, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    for (const c of cols) {
      doc.text(c.label, x + 6, y + 12);
      x += c.w;
    }
    y += 18;
    doc.setTextColor(15, 23, 42);

    for (const d of deliverables) {
      const title = d.title || "—";
      const resp = d.responsible || (d.responsible_user_id ? profilesById[d.responsible_user_id] : "") || "—";
      const due = d.due_date ? fmtDate(d.due_date) : "—";
      const status = STATUS_LABEL[d.status] || d.status || "—";
      const check = d.done ? "X" : "";

      const titleLines = doc.splitTextToSize(title, cols[1].w - 12);
      const rowH = Math.max(18, titleLines.length * 12 + 6);
      ensure(rowH);

      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, margin + contentWidth, y);

      let cx = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(check, cx + 8, y + 13);
      cx += cols[0].w;

      doc.setFont("helvetica", d.done ? "italic" : "normal");
      doc.setFontSize(10);
      doc.setTextColor(d.done ? 100 : 15, d.done ? 116 : 23, d.done ? 139 : 42);
      for (let i = 0; i < titleLines.length; i++) {
        doc.text(titleLines[i], cx + 6, y + 13 + i * 12);
      }
      doc.setTextColor(15, 23, 42);
      cx += cols[1].w;

      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(resp, cols[2].w - 8)[0], cx + 6, y + 13);
      cx += cols[2].w;
      doc.text(due, cx + 6, y + 13);
      cx += cols[3].w;
      doc.text(status, cx + 6, y + 13);

      y += rowH;
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, margin + contentWidth, y);
    y += 12;
  }

  // Checklists (3 columns)
  if (checklists && checklists.length) {
    ensure(28);
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(254, 215, 170);
    doc.roundedRect(margin, y, contentWidth, 20, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(124, 45, 18);
    doc.text("Checklists do dia", margin + 8, y + 14);
    y += 26;
    doc.setTextColor(20, 20, 20);

    const gap = 10;
    const colW = (contentWidth - gap * 2) / 3;
    const startY = y;
    let maxBottom = y;
    for (let i = 0; i < checklists.length; i++) {
      const c = checklists[i];
      const cx = margin + i * (colW + gap);
      let cy = startY;

      // header
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(cx, cy, colW, 18, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(c.title, cx + 8, cy + 12);
      cy += 22;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      for (const item of c.items) {
        const checked = !!c.state?.[item];
        const lines = doc.splitTextToSize(item, colW - 22);
        const h = lines.length * 11 + 4;
        if (cy + h > pageHeight - margin) {
          doc.addPage();
          cy = margin;
        }
        // checkbox
        doc.setDrawColor(148, 163, 184);
        doc.rect(cx + 4, cy - 1, 9, 9, "S");
        if (checked) {
          doc.setFont("helvetica", "bold");
          doc.text("X", cx + 5.5, cy + 6.5);
          doc.setFont("helvetica", "normal");
        }
        doc.setTextColor(checked ? 100 : 15, checked ? 116 : 23, checked ? 139 : 42);
        for (let li = 0; li < lines.length; li++) {
          doc.text(lines[li], cx + 18, cy + 6 + li * 11);
        }
        doc.setTextColor(15, 23, 42);
        cy += h;
      }
      if (cy > maxBottom) maxBottom = cy;
    }
    y = maxBottom + 8;
  }

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${i}/${pages}`, pageWidth - margin, pageHeight - 16, { align: "right" });
  }

  doc.save(`${title.replace(/[^a-z0-9]+/gi, "_")}.pdf`);
}

// ----- Component -----

export default function PlanningArchive() {
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod("month"));
  const [daily, setDaily] = useState<DailyPlan[]>([]);
  const [weekly, setWeekly] = useState<WeeklyPlan[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; display_name: string | null }[]>([]);
  const [open, setOpen] = useState<
    | { kind: "daily"; record: DailyPlan; assignments: Assignment[]; deliverables: Deliverable[] }
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

  const profilesById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of profiles) m[p.user_id] = p.display_name || "—";
    return m;
  }, [profiles]);

  const nameOf = (uid: string) => profilesById[uid] || "—";

  async function loadDailyExtras(planId: string) {
    const [{ data: a }, { data: d }] = await Promise.all([
      supabase.from("manager_daily_assignments").select("*").eq("daily_plan_id", planId),
      supabase.from("daily_plan_deliverables").select("*").eq("daily_plan_id", planId).order("sort_order"),
    ]);
    return { assignments: (a as Assignment[]) ?? [], deliverables: (d as Deliverable[]) ?? [] };
  }

  async function openDaily(p: DailyPlan) {
    const extras = await loadDailyExtras(p.id);
    setOpen({ kind: "daily", record: p, ...extras });
  }

  async function exportDaily(p: DailyPlan) {
    const extras = await loadDailyExtras(p.id);
    buildPlanPdf({
      title: `Plano diário — ${fmtDate(p.plan_date)}`,
      subtitle: `Responsável: ${nameOf(p.manager_id)}`,
      sections: DAILY_SECTIONS,
      record: p,
      assignments: extras.assignments,
      deliverables: extras.deliverables,
      checklists: [
        { title: "Abertura do dia", items: OPENING, state: p.opening_checklist ?? {} },
        { title: "Durante o dia", items: DURING, state: p.during_checklist ?? {} },
        { title: "Fechamento do dia", items: CLOSING, state: p.closing_checklist ?? {} },
      ],
      profilesById,
    });
  }

  function exportWeekly(p: WeeklyPlan) {
    buildPlanPdf({
      title: `Plano semanal — ${fmtDate(p.week_start)}`,
      subtitle: `Responsável: ${nameOf(p.manager_id)}`,
      sections: WEEKLY_SECTIONS,
      record: p,
      profilesById,
    });
  }

  // ----- Render -----

  const renderSectionPreview = (sec: Section, record: Record<string, any>) => (
    <div key={sec.title} className="border border-border/50 rounded-lg overflow-hidden">
      <div className="bg-secondary/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
        {sec.title}
      </div>
      <div className={`p-3 grid gap-2 ${
        sec.cols === 3 ? "md:grid-cols-3" : sec.cols === 2 ? "md:grid-cols-2" : "grid-cols-1"
      }`}>
        {sec.fields.map((f) => (
          <div key={f.key} className="border border-border/40 rounded p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</div>
            <div className="text-sm whitespace-pre-wrap mt-0.5">{formatValue(f.key, record[f.key])}</div>
          </div>
        ))}
      </div>
    </div>
  );

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
                    <Button size="sm" variant="outline" onClick={() => openDaily(p)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Abrir
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => exportDaily(p)}>
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
                    <Button size="sm" variant="outline" onClick={() => exportWeekly(p)}>
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
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {open.kind === "daily"
                    ? `Plano diário — ${fmtDate(open.record.plan_date)}`
                    : `Plano semanal — ${fmtDate(open.record.week_start)}`}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Responsável: {nameOf(open.record.manager_id)}
                </p>
              </DialogHeader>

              <div className="space-y-4">
                {(open.kind === "daily" ? DAILY_SECTIONS : WEEKLY_SECTIONS).map((sec) =>
                  renderSectionPreview(sec, open.record)
                )}

                {open.kind === "daily" && open.assignments.length > 0 && (
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    <div className="bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                      3 prioridades por pessoa do time
                    </div>
                    <div className="p-3 space-y-2">
                      {open.assignments.map((a) => (
                        <div key={a.id} className="border border-border/40 rounded p-2 text-sm">
                          <div className="font-semibold">{nameOf(a.assignee_id)}</div>
                          <div><span className="text-muted-foreground text-xs">Missão:</span> {a.main_mission || "—"}</div>
                          <div className="grid md:grid-cols-2 gap-1">
                            <div><span className="text-muted-foreground text-xs">Sec. 1:</span> {a.secondary_1 || "—"}</div>
                            <div><span className="text-muted-foreground text-xs">Sec. 2:</span> {a.secondary_2 || "—"}</div>
                          </div>
                          {a.observation && (
                            <div className="text-xs text-muted-foreground mt-1">Obs.: {a.observation}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {open.kind === "daily" && open.deliverables.length > 0 && (
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    <div className="bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                      Entregas, donos e prazos
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/40 text-xs">
                        <tr>
                          <th className="text-left p-2 w-8">✓</th>
                          <th className="text-left p-2">Entrega</th>
                          <th className="text-left p-2">Responsável</th>
                          <th className="text-left p-2">Prazo</th>
                          <th className="text-left p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {open.deliverables.map((d) => (
                          <tr key={d.id} className="border-t border-border/30">
                            <td className="p-2">{d.done ? "✓" : ""}</td>
                            <td className={"p-2 " + (d.done ? "line-through text-muted-foreground" : "")}>{d.title}</td>
                            <td className="p-2">{d.responsible || (d.responsible_user_id ? nameOf(d.responsible_user_id) : "—")}</td>
                            <td className="p-2">{d.due_date ? fmtDate(d.due_date) : "—"}</td>
                            <td className="p-2">{STATUS_LABEL[d.status] || d.status || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {open.kind === "daily" && (
                  <div className="grid md:grid-cols-3 gap-3">
                    {[
                      { title: "Abertura do dia", items: OPENING, state: open.record.opening_checklist ?? {} },
                      { title: "Durante o dia", items: DURING, state: open.record.during_checklist ?? {} },
                      { title: "Fechamento do dia", items: CLOSING, state: open.record.closing_checklist ?? {} },
                    ].map((c) => (
                      <div key={c.title} className="border border-border/50 rounded-lg overflow-hidden">
                        <div className="bg-orange-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                          {c.title}
                        </div>
                        <ul className="p-3 space-y-1.5 text-sm">
                          {c.items.map((item) => {
                            const ck = !!(c.state as Record<string, boolean>)[item];
                            return (
                              <li key={item} className="flex items-start gap-2">
                                <span className={"mt-0.5 inline-flex h-4 w-4 items-center justify-center border rounded text-[10px] " + (ck ? "bg-primary text-primary-foreground border-primary" : "border-border")}>
                                  {ck ? "✓" : ""}
                                </span>
                                <span className={ck ? "line-through text-muted-foreground" : ""}>{item}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    open.kind === "daily" ? exportDaily(open.record) : exportWeekly(open.record)
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
