import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Trash2, Plus, Users, ClipboardCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { todayStr, type DailyPlan, type Assignment, type Deliverable } from "@/lib/usePlanning";
import { Badge } from "@/components/ui/badge";

const OPENING = [
  "Revisou a missão principal de ontem",
  "Identificou pendências abertas",
  "Identificou travas e gargalos",
  "Conduziu a reunião de alinhamento",
  "Fechou missão principal do dia",
  "Fechou prioridade secundária 1",
  "Fechou prioridade secundária 2",
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

type Profile = { user_id: string; display_name: string | null };

export default function DailyPlanForm() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [plan, setPlan] = useState<Partial<DailyPlan>>({
    method: "tatico",
    yesterday_status: "concluida",
    opening_checklist: {},
    during_checklist: {},
    closing_checklist: {},
  });
  const [planId, setPlanId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Partial<Assignment>[]>([]);
  const [deliverables, setDeliverables] = useState<Partial<Deliverable>[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data: p }, { data: prof }] = await Promise.all([
      supabase
        .from("manager_daily_plans")
        .select("*")
        .eq("plan_date", date)
        .eq("manager_id", user?.id ?? "")
        .maybeSingle(),
      supabase.from("profiles").select("user_id, display_name").eq("is_active", true),
    ]);
    if (prof) setProfiles(prof as Profile[]);
    if (p) {
      setPlan(p as Partial<DailyPlan>);
      setPlanId(p.id);
      const [{ data: a }, { data: d }] = await Promise.all([
        supabase.from("manager_daily_assignments").select("*").eq("daily_plan_id", p.id),
        supabase.from("daily_plan_deliverables").select("*").eq("daily_plan_id", p.id).order("sort_order"),
      ]);
      setAssignments((a as Assignment[]) ?? []);
      setDeliverables((d as Deliverable[]) ?? []);
    } else {
      setPlanId(null);
      setPlan({
        method: "tatico",
        yesterday_status: "concluida",
        opening_checklist: {},
        during_checklist: {},
        closing_checklist: {},
      });
      setAssignments([]);
      setDeliverables([]);
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, user?.id]);

  function setField<K extends keyof DailyPlan>(k: K, v: DailyPlan[K]) {
    setPlan((p) => ({ ...p, [k]: v }));
  }

  function toggleChecklist(
    field: "opening_checklist" | "during_checklist" | "closing_checklist",
    item: string
  ) {
    setPlan((p) => ({
      ...p,
      [field]: { ...(p[field] as Record<string, boolean>), [item]: !(p[field] as Record<string, boolean>)?.[item] },
    }));
  }

  async function save() {
    if (!user) return;
    setSaving(true);

    const payload = {
      manager_id: user.id,
      plan_date: date,
      method: plan.method ?? "tatico",
      meeting_start: plan.meeting_start || null,
      meeting_end: plan.meeting_end || null,
      meeting_duration_min: plan.meeting_duration_min ?? null,
      conducted_by: plan.conducted_by ?? null,
      participant_1: plan.participant_1 ?? null,
      participant_2: plan.participant_2 ?? null,
      participant_3: plan.participant_3 ?? null,
      yesterday_main_mission: plan.yesterday_main_mission ?? null,
      yesterday_status: plan.yesterday_status ?? null,
      yesterday_advanced: plan.yesterday_advanced ?? null,
      yesterday_blocked: plan.yesterday_blocked ?? null,
      yesterday_pending: plan.yesterday_pending ?? null,
      today_fixed: plan.today_fixed ?? null,
      today_urgencies: plan.today_urgencies ?? null,
      today_bottlenecks: plan.today_bottlenecks ?? null,
      today_main_risk: plan.today_main_risk ?? null,
      main_mission: plan.main_mission ?? null,
      secondary_1: plan.secondary_1 ?? null,
      secondary_2: plan.secondary_2 ?? null,
      to_block: plan.to_block ?? null,
      to_delegate: plan.to_delegate ?? null,
      not_today: plan.not_today ?? null,
      needs_support: plan.needs_support ?? null,
      pending_next: plan.pending_next ?? null,
      opening_checklist: plan.opening_checklist ?? {},
      during_checklist: plan.during_checklist ?? {},
      closing_checklist: plan.closing_checklist ?? {},
      notes: plan.notes ?? null,
    };

    let currentId = planId;
    if (currentId) {
      const { error } = await supabase
        .from("manager_daily_plans")
        .update(payload)
        .eq("id", currentId);
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
    } else {
      const { data, error } = await supabase
        .from("manager_daily_plans")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        return toast.error(error?.message ?? "Erro ao salvar");
      }
      currentId = data.id;
      setPlanId(currentId);
    }

    // Save assignments
    await supabase.from("manager_daily_assignments").delete().eq("daily_plan_id", currentId);
    const validAssignments = assignments.filter(
      (a) => a.assignee_id && a.main_mission?.trim()
    );
    if (validAssignments.length) {
      const { error } = await supabase.from("manager_daily_assignments").insert(
        validAssignments.map((a) => ({
          daily_plan_id: currentId!,
          assignee_id: a.assignee_id!,
          main_mission: a.main_mission!,
          secondary_1: a.secondary_1 || null,
          secondary_2: a.secondary_2 || null,
          observation: a.observation || null,
        }))
      );
      if (error) toast.error("Atribuições: " + error.message);
    }

    // Save deliverables (preservando done/done_at/done_by quando o item já existe)
    const validDeliv = deliverables.filter((d) => d.title?.trim());
    const existingIds = validDeliv.map((d) => d.id).filter(Boolean) as string[];
    // Apaga apenas itens removidos pelo admin
    if (existingIds.length) {
      await supabase
        .from("daily_plan_deliverables")
        .delete()
        .eq("daily_plan_id", currentId)
        .not("id", "in", `(${existingIds.map((i) => `"${i}"`).join(",")})`);
    } else {
      await supabase.from("daily_plan_deliverables").delete().eq("daily_plan_id", currentId);
    }
    for (let idx = 0; idx < validDeliv.length; idx++) {
      const d = validDeliv[idx];
      const payload = {
        daily_plan_id: currentId!,
        title: d.title!,
        responsible: d.responsible || null,
        responsible_user_id: d.responsible_user_id || null,
        due_date: d.due_date || null,
        status: d.status || "pending",
        sort_order: idx,
      };
      if (d.id) {
        const { error } = await supabase
          .from("daily_plan_deliverables")
          .update(payload)
          .eq("id", d.id);
        if (error) toast.error("Entregas: " + error.message);
      } else {
        const { error } = await supabase
          .from("daily_plan_deliverables")
          .insert(payload);
        if (error) toast.error("Entregas: " + error.message);
      }
    }

    setSaving(false);
    toast.success("Plano salvo");
    load();
  }

  function addAssignment() {
    setAssignments((a) => [
      ...a,
      { assignee_id: "", main_mission: "", secondary_1: "", secondary_2: "", observation: "" },
    ]);
  }
  function updateAssignment(i: number, patch: Partial<Assignment>) {
    setAssignments((a) => a.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removeAssignment(i: number) {
    setAssignments((a) => a.filter((_, idx) => idx !== i));
  }

  function addDeliverable() {
    setDeliverables((d) => [
      ...d,
      { title: "", responsible: "", due_date: date, status: "pending" },
    ]);
  }
  function updateDeliverable(i: number, patch: Partial<Deliverable>) {
    setDeliverables((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removeDeliverable(i: number) {
    setDeliverables((d) => d.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 bg-card border-border/50">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <Label className="text-xs">Data do plano</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div>
              <Label className="text-xs">Método</Label>
              <Select
                value={plan.method ?? "tatico"}
                onValueChange={(v) => setField("method", v)}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tatico">Tático</SelectItem>
                  <SelectItem value="operacional">Operacional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {planId && <Badge variant="outline" className="self-end mb-1">Plano salvo</Badge>}
          </div>
          <Button onClick={save} disabled={saving} className="self-end">
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Salvando…" : "Salvar plano"}
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div>
            <Label className="text-xs">Início da reunião</Label>
            <Input
              type="time"
              value={plan.meeting_start ?? ""}
              onChange={(e) => setField("meeting_start", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Término</Label>
            <Input
              type="time"
              value={plan.meeting_end ?? ""}
              onChange={(e) => setField("meeting_end", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Duração (min) — máx 31</Label>
            <Input
              type="number"
              max={31}
              value={plan.meeting_duration_min ?? ""}
              onChange={(e) =>
                setField("meeting_duration_min", e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3 mt-3">
          <Input
            placeholder="Conduzida por"
            value={plan.conducted_by ?? ""}
            onChange={(e) => setField("conducted_by", e.target.value)}
          />
          <Input
            placeholder="Participante 1"
            value={plan.participant_1 ?? ""}
            onChange={(e) => setField("participant_1", e.target.value)}
          />
          <Input
            placeholder="Participante 2"
            value={plan.participant_2 ?? ""}
            onChange={(e) => setField("participant_2", e.target.value)}
          />
          <Input
            placeholder="Participante 3"
            value={plan.participant_3 ?? ""}
            onChange={(e) => setField("participant_3", e.target.value)}
          />
        </div>
      </Card>

      {/* Revisão de ontem */}
      <Card className="p-5 bg-card border-border/50">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span className="h-6 w-6 rounded bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
            1
          </span>
          Revisão de ontem
        </h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Missão principal de ontem</Label>
            <Input
              value={plan.yesterday_main_mission ?? ""}
              onChange={(e) => setField("yesterday_main_mission", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select
              value={plan.yesterday_status ?? "concluida"}
              onValueChange={(v) => setField("yesterday_status", v)}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="nao_concluida">Não concluída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">O que avançou de verdade</Label>
              <Textarea
                rows={3}
                value={plan.yesterday_advanced ?? ""}
                onChange={(e) => setField("yesterday_advanced", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">O que travou</Label>
              <Textarea
                rows={3}
                value={plan.yesterday_blocked ?? ""}
                onChange={(e) => setField("yesterday_blocked", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">O que ficou pendente</Label>
              <Textarea
                rows={3}
                value={plan.yesterday_pending ?? ""}
                onChange={(e) => setField("yesterday_pending", e.target.value)}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Cenário de hoje */}
      <Card className="p-5 bg-card border-border/50">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span className="h-6 w-6 rounded bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
            2
          </span>
          Cenário do dia
        </h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Compromissos fixos</Label>
            <Textarea
              rows={2}
              value={plan.today_fixed ?? ""}
              onChange={(e) => setField("today_fixed", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Urgências reais</Label>
            <Textarea
              rows={2}
              value={plan.today_urgencies ?? ""}
              onChange={(e) => setField("today_urgencies", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Gargalos / dependências</Label>
            <Textarea
              rows={2}
              value={plan.today_bottlenecks ?? ""}
              onChange={(e) => setField("today_bottlenecks", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Principal risco do dia</Label>
            <Textarea
              rows={2}
              value={plan.today_main_risk ?? ""}
              onChange={(e) => setField("today_main_risk", e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Definição do dia */}
      <Card className="p-5 bg-gradient-card border-primary/30">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span className="h-6 w-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
            3
          </span>
          Definição do dia (gestor)
        </h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Missão principal de hoje</Label>
            <Input
              value={plan.main_mission ?? ""}
              onChange={(e) => setField("main_mission", e.target.value)}
              placeholder="A entrega de maior impacto do dia"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Prioridade secundária 1</Label>
              <Input
                value={plan.secondary_1 ?? ""}
                onChange={(e) => setField("secondary_1", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Prioridade secundária 2</Label>
              <Input
                value={plan.secondary_2 ?? ""}
                onChange={(e) => setField("secondary_2", e.target.value)}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Atribuições por pessoa */}
      <Card className="p-5 bg-card border-border/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            3 prioridades por pessoa do time
          </h3>
          <Button size="sm" variant="outline" onClick={addAssignment}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar pessoa
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Cada pessoa vai ver missão + 2 secundárias na rotina dela.
        </p>
        {assignments.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma atribuição ainda.</p>
        )}
        <div className="space-y-3">
          {assignments.map((a, i) => (
            <div key={i} className="border border-border/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Select
                  value={a.assignee_id ?? ""}
                  onValueChange={(v) => updateAssignment(i, { assignee_id: v })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione o colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.display_name || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeAssignment(i)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
              <Input
                placeholder="Missão principal"
                value={a.main_mission ?? ""}
                onChange={(e) => updateAssignment(i, { main_mission: e.target.value })}
              />
              <div className="grid md:grid-cols-2 gap-2">
                <Input
                  placeholder="Secundária 1"
                  value={a.secondary_1 ?? ""}
                  onChange={(e) => updateAssignment(i, { secondary_1: e.target.value })}
                />
                <Input
                  placeholder="Secundária 2"
                  value={a.secondary_2 ?? ""}
                  onChange={(e) => updateAssignment(i, { secondary_2: e.target.value })}
                />
              </div>
              <Textarea
                rows={2}
                placeholder="Observação (opcional)"
                value={a.observation ?? ""}
                onChange={(e) => updateAssignment(i, { observation: e.target.value })}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Donos, prazos */}
      <Card className="p-5 bg-card border-border/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Entregas, donos e prazos
          </h3>
          <Button size="sm" variant="outline" onClick={addDeliverable}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar entrega
          </Button>
        </div>
        {deliverables.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma entrega listada.</p>
        )}
        <div className="space-y-2">
          {deliverables.map((d, i) => (
            <div key={i} className="grid grid-cols-[28px_1fr_180px_140px_140px_40px] gap-2 items-center">
              <Checkbox
                checked={!!d.done}
                onCheckedChange={async (v) => {
                  const checked = !!v;
                  updateDeliverable(i, {
                    done: checked,
                    done_at: checked ? new Date().toISOString() : null,
                    done_by: checked ? user?.id ?? null : null,
                    status: checked ? "done" : d.status === "done" ? "pending" : d.status,
                  });
                  if (d.id) {
                    await supabase
                      .from("daily_plan_deliverables")
                      .update({
                        done: checked,
                        done_at: checked ? new Date().toISOString() : null,
                        done_by: checked ? user?.id ?? null : null,
                        status: checked ? "done" : d.status === "done" ? "pending" : d.status,
                      })
                      .eq("id", d.id);
                  }
                }}
                title="Marcar concluído"
              />
              <Input
                placeholder="Entrega"
                value={d.title ?? ""}
                onChange={(e) => updateDeliverable(i, { title: e.target.value })}
                className={d.done ? "line-through text-muted-foreground" : ""}
              />
              <Input
                placeholder="Responsável"
                value={d.responsible ?? ""}
                onChange={(e) => updateDeliverable(i, { responsible: e.target.value })}
              />
              <Input
                type="date"
                value={d.due_date ?? ""}
                onChange={(e) => updateDeliverable(i, { due_date: e.target.value })}
              />
              <Select
                value={d.status ?? "pending"}
                onValueChange={(v) => updateDeliverable(i, { status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="done">Concluído</SelectItem>
                  <SelectItem value="blocked">Travado</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => removeDeliverable(i)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Proteção da execução */}
      <Card className="p-5 bg-card border-border/50">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-primary" />
          Proteção da execução
        </h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">O que precisa ser bloqueado hoje</Label>
            <Textarea rows={2} value={plan.to_block ?? ""} onChange={(e) => setField("to_block", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">O que pode ser delegado</Label>
            <Textarea rows={2} value={plan.to_delegate ?? ""} onChange={(e) => setField("to_delegate", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">O que NÃO entra hoje</Label>
            <Textarea rows={2} value={plan.not_today ?? ""} onChange={(e) => setField("not_today", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Quem precisa de apoio imediato</Label>
            <Textarea rows={2} value={plan.needs_support ?? ""} onChange={(e) => setField("needs_support", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Pendência que volta no próximo alinhamento</Label>
            <Textarea rows={2} value={plan.pending_next ?? ""} onChange={(e) => setField("pending_next", e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Checklists */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { title: "Abertura do dia", items: OPENING, field: "opening_checklist" as const },
          { title: "Durante o dia", items: DURING, field: "during_checklist" as const },
          { title: "Fechamento do dia", items: CLOSING, field: "closing_checklist" as const },
        ].map((c) => (
          <Card key={c.field} className="p-4 bg-card border-border/50">
            <h4 className="font-semibold text-sm mb-3">{c.title}</h4>
            <ul className="space-y-2">
              {c.items.map((item) => {
                const checked = !!(plan[c.field] as Record<string, boolean>)?.[item];
                return (
                  <li key={item} className="flex items-start gap-2">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleChecklist(c.field, item)}
                      className="mt-0.5"
                    />
                    <span className={checked ? "text-sm line-through text-muted-foreground" : "text-sm"}>
                      {item}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
