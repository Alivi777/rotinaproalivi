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
import { useIsAdmin } from "@/lib/useIsAdmin";
import { FileText, Save, Download, CheckCircle2, MessageSquareText, UserPlus, History } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import PeriodFilter, { defaultPeriod, type PeriodValue } from "@/components/PeriodFilter";

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
  const { isAdmin } = useIsAdmin();
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

      <ReportsHistory sectors={sectors} isAdmin={isAdmin} currentUserId={user?.id} />
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

type ReportRow = {
  id: string;
  user_id: string;
  sector_id: string;
  report_date: string;
  notes: string | null;
  data: Record<string, unknown> | null;
  submitted_at: string | null;
};

function AdminReportsHistory({ sectors }: { sectors: { id: string; name: string }[] }) {
  const [profiles, setProfiles] = useState<{ user_id: string; display_name: string | null }[]>([]);
  const [items, setItems] = useState<ReportRow[]>([]);
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterSector, setFilterSector] = useState<string>("all");
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("is_active", true)
      .order("display_name")
      .then(({ data }) => setProfiles(data ?? []));
  }, []);

  useEffect(() => {
    let q = supabase
      .from("daily_reports")
      .select("id, user_id, sector_id, report_date, notes, data, submitted_at")
      .gte("report_date", from)
      .lte("report_date", to)
      .order("report_date", { ascending: false });
    if (filterUser !== "all") q = q.eq("user_id", filterUser);
    if (filterSector !== "all") q = q.eq("sector_id", filterSector);
    q.then(({ data }) => setItems((data as ReportRow[]) ?? []));
  }, [filterUser, filterSector, from, to]);

  const nameOf = (uid: string) =>
    profiles.find((p) => p.user_id === uid)?.display_name || "—";
  const sectorOf = (sid: string) => sectors.find((s) => s.id === sid)?.name || "—";

  return (
    <Card className="mt-6 p-6 bg-card border-border/50">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Histórico geral (admin)</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-widest">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest">Colaborador</Label>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.display_name || "Sem nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest">Setor</Label>
            <Select value={filterSector} onValueChange={setFilterSector}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum relatório no período.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map((r) => {
            const d = (r.data ?? {}) as { highlights?: string; issues?: string; nextSteps?: string };
            return (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground w-24">
                    {new Date(r.report_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </span>
                  <span className="text-sm font-semibold">{nameOf(r.user_id)}</span>
                  <span className="text-xs text-muted-foreground">· {sectorOf(r.sector_id)}</span>
                  <Badge variant={r.submitted_at ? "default" : "secondary"} className="text-[10px] uppercase">
                    {r.submitted_at ? "Enviado" : "Rascunho"}
                  </Badge>
                </div>
                <div className="grid md:grid-cols-3 gap-2 text-xs">
                  {d.highlights && <Snippet label="Destaques" text={d.highlights} />}
                  {d.issues && <Snippet label="Ocorrências" text={d.issues} />}
                  {d.nextSteps && <Snippet label="Próximos passos" text={d.nextSteps} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="p-2 rounded-md bg-background/40 border border-border/40">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">{label}</div>
      <p className="line-clamp-3 text-foreground/90">{text}</p>
    </div>
  );
}
