import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useProfile, useSectors } from "@/lib/useProfile";
import { FileText, Save, Download, CheckCircle2, MessageSquareText, UserPlus } from "lucide-react";
import { toast } from "sonner";

const todayStr = () => new Date().toISOString().slice(0, 10);
const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

type AutoData = {
  tasksTotal: number;
  tasksDone: number;
  tasksPending: string[];
  waTotal: number;
  waUnique: number;
  newClients: number;
};

export default function ReportPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { sectors } = useSectors();
  const [sectorId, setSectorId] = useState<string>("");
  const [highlights, setHighlights] = useState("");
  const [issues, setIssues] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [observations, setObservations] = useState("");
  const [auto, setAuto] = useState<AutoData | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = todayStr();

  useEffect(() => {
    if (profile?.sector_id && !sectorId) setSectorId(profile.sector_id);
  }, [profile, sectorId]);

  // Load existing report + auto data per selected sector
  useEffect(() => {
    if (!sectorId || !user) return;
    (async () => {
      const dayStart = startOfDay();
      const [tasks, comps, wa, nc, existing] = await Promise.all([
        supabase
          .from("routine_tasks")
          .select("id, title")
          .eq("active", true)
          .eq("sector_id", sectorId),
        supabase
          .from("task_completions")
          .select("task_id, user_id")
          .eq("completion_date", today),
        supabase
          .from("whatsapp_messages")
          .select("from_phone")
          .gte("received_at", dayStart),
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart),
        supabase
          .from("daily_reports")
          .select("*")
          .eq("user_id", user.id)
          .eq("sector_id", sectorId)
          .eq("report_date", today)
          .maybeSingle(),
      ]);

      const sectorTaskIds = (tasks.data ?? []).map((t) => t.id);
      const doneIds = new Set(
        (comps.data ?? [])
          .filter((c) => sectorTaskIds.includes(c.task_id))
          .map((c) => c.task_id)
      );
      const pending = (tasks.data ?? [])
        .filter((t) => !doneIds.has(t.id))
        .map((t) => t.title);
      const phones = new Set((wa.data ?? []).map((m) => m.from_phone));

      setAuto({
        tasksTotal: sectorTaskIds.length,
        tasksDone: doneIds.size,
        tasksPending: pending,
        waTotal: wa.data?.length ?? 0,
        waUnique: phones.size,
        newClients: nc.count ?? 0,
      });

      if (existing.data) {
        const d = existing.data.data as Record<string, string>;
        setReportId(existing.data.id);
        setHighlights(d.highlights ?? "");
        setIssues(d.issues ?? "");
        setNextSteps(d.nextSteps ?? "");
        setObservations(existing.data.notes ?? "");
        setSubmitted(!!existing.data.submitted_at);
      } else {
        setReportId(null);
        setHighlights("");
        setIssues("");
        setNextSteps("");
        setObservations("");
        setSubmitted(false);
      }
    })();
  }, [sectorId, user, today]);

  async function save(submit = false) {
    if (!user || !sectorId) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      sector_id: sectorId,
      report_date: today,
      data: { highlights, issues, nextSteps, auto },
      notes: observations,
      submitted_at: submit ? new Date().toISOString() : null,
    };
    const { data, error } = reportId
      ? await supabase
          .from("daily_reports")
          .update(payload)
          .eq("id", reportId)
          .select()
          .single()
      : await supabase.from("daily_reports").insert(payload).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    if (data) setReportId(data.id);
    setSubmitted(submit);
    toast.success(submit ? "Relatório enviado!" : "Rascunho salvo");
  }

  const sector = useMemo(() => sectors.find((s) => s.id === sectorId), [sectors, sectorId]);

  function exportTxt() {
    if (!sector || !auto) return;
    const lines = [
      `RELATÓRIO DIÁRIO — ${sector.name}`,
      `Data: ${new Date().toLocaleDateString("pt-BR")}`,
      `Responsável: ${profile?.display_name || user?.email}`,
      ``,
      `── RESUMO AUTOMÁTICO ──`,
      `Tarefas concluídas: ${auto.tasksDone}/${auto.tasksTotal}`,
      `Atendimentos WhatsApp: ${auto.waTotal} (${auto.waUnique} contatos únicos)`,
      `Novos clientes: ${auto.newClients}`,
      auto.tasksPending.length
        ? `Tarefas pendentes:\n  - ${auto.tasksPending.join("\n  - ")}`
        : `Todas as tarefas concluídas.`,
      ``,
      `── DESTAQUES ──`,
      highlights || "(em branco)",
      ``,
      `── PROBLEMAS / OCORRÊNCIAS ──`,
      issues || "(em branco)",
      ``,
      `── PRÓXIMOS PASSOS ──`,
      nextSteps || "(em branco)",
      ``,
      `── OBSERVAÇÕES ──`,
      observations || "(em branco)",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${sector.slug}-${today}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <header className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
            <FileText className="h-3.5 w-3.5" />
            Relatório diário
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Fechamento do dia</h1>
          <p className="text-muted-foreground mt-1">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={sectorId} onValueChange={setSectorId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Setor" />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Auto-filled summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Tarefas"
          value={auto ? `${auto.tasksDone}/${auto.tasksTotal}` : "—"}
        />
        <SummaryCard
          icon={<MessageSquareText className="h-4 w-4" />}
          label="WhatsApp"
          value={auto ? String(auto.waTotal) : "—"}
          hint={auto ? `${auto.waUnique} únicos` : undefined}
        />
        <SummaryCard
          icon={<UserPlus className="h-4 w-4" />}
          label="Novos clientes"
          value={auto ? String(auto.newClients) : "—"}
        />
        <SummaryCard
          icon={<FileText className="h-4 w-4" />}
          label="Status"
          value={submitted ? "Enviado" : reportId ? "Rascunho" : "Não iniciado"}
        />
      </div>

      {auto && auto.tasksPending.length > 0 && (
        <Card className="p-4 mb-6 bg-warning/5 border-warning/30">
          <div className="text-xs uppercase tracking-widest text-warning mb-2 font-semibold">
            Tarefas pendentes ({auto.tasksPending.length})
          </div>
          <ul className="text-sm space-y-1">
            {auto.tasksPending.map((t) => (
              <li key={t}>• {t}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6 bg-card border-border/50 space-y-5">
        <div>
          <Label>Destaques do dia</Label>
          <Textarea
            value={highlights}
            onChange={(e) => setHighlights(e.target.value)}
            placeholder="Resultados positivos, conquistas, marcos..."
            rows={3}
          />
        </div>
        <div>
          <Label>Problemas / ocorrências</Label>
          <Textarea
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
            placeholder="Reclamações, falhas, atritos com clientes..."
            rows={3}
          />
        </div>
        <div>
          <Label>Próximos passos</Label>
          <Textarea
            value={nextSteps}
            onChange={(e) => setNextSteps(e.target.value)}
            placeholder="Encaminhamentos, follow-ups para amanhã..."
            rows={3}
          />
        </div>
        <div>
          <Label>Observações livres</Label>
          <Textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex flex-wrap gap-3 pt-2 border-t border-border/50">
          <Button onClick={() => save(false)} variant="secondary" disabled={saving || !sectorId}>
            <Save className="h-4 w-4 mr-1" /> Salvar rascunho
          </Button>
          <Button onClick={() => save(true)} disabled={saving || !sectorId}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {submitted ? "Reenviar" : "Enviar relatório"}
          </Button>
          <Button onClick={exportTxt} variant="outline" disabled={!auto}>
            <Download className="h-4 w-4 mr-1" /> Exportar .txt
          </Button>
        </div>
      </Card>
    </AppShell>
  );
}

function SummaryCard({
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
    <Card className="p-4 bg-gradient-card border-border/50">
      <div className="flex items-center justify-between mb-1.5 text-muted-foreground">
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}
