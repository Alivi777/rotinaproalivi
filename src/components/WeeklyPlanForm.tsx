import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Activity } from "lucide-react";
import { toast } from "sonner";
import { getMondayOf, type WeeklyPlan } from "@/lib/usePlanning";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function WeeklyPlanForm() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(getMondayOf(new Date()));
  const [plan, setPlan] = useState<Partial<WeeklyPlan>>({
    method: "tatico",
    classification: "verde",
  });
  const [planId, setPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("manager_weekly_plans")
      .select("*")
      .eq("manager_id", user?.id ?? "")
      .eq("week_start", weekStart)
      .maybeSingle();
    if (data) {
      setPlan(data as Partial<WeeklyPlan>);
      setPlanId(data.id);
    } else {
      setPlanId(null);
      setPlan({ method: "tatico", classification: "verde" });
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, weekStart]);

  function setField<K extends keyof WeeklyPlan>(k: K, v: WeeklyPlan[K]) {
    setPlan((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    const payload = {
      manager_id: user.id,
      week_start: weekStart,
      method: plan.method ?? "tatico",
      prev_what_worked: plan.prev_what_worked ?? null,
      prev_time_wasters: plan.prev_time_wasters ?? null,
      prev_excess_alignment: plan.prev_excess_alignment ?? null,
      prev_excess_execution: plan.prev_excess_execution ?? null,
      prev_repeated_block: plan.prev_repeated_block ?? null,
      prev_single_correction: plan.prev_single_correction ?? null,
      week_focus: plan.week_focus ?? null,
      fixed_commitments: plan.fixed_commitments ?? null,
      not_this_week: plan.not_this_week ?? null,
      mission_blocks: plan.mission_blocks ?? null,
      secondary_blocks: plan.secondary_blocks ?? null,
      ind_alignments_done: plan.ind_alignments_done ?? 0,
      ind_meetings_under_31: plan.ind_meetings_under_31 ?? 0,
      ind_missions_done: plan.ind_missions_done ?? 0,
      ind_blocks_protected: plan.ind_blocks_protected ?? 0,
      ind_tasks_delegated: plan.ind_tasks_delegated ?? 0,
      ind_tasks_eliminated: plan.ind_tasks_eliminated ?? 0,
      ind_days_tomorrow_defined: plan.ind_days_tomorrow_defined ?? 0,
      ind_interruptions: plan.ind_interruptions ?? 0,
      classification: plan.classification ?? null,
      notes: plan.notes ?? null,
    };

    if (planId) {
      const { error } = await supabase
        .from("manager_weekly_plans")
        .update(payload)
        .eq("id", planId);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { error } = await supabase.from("manager_weekly_plans").insert(payload);
      if (error) { setSaving(false); return toast.error(error.message); }
    }
    setSaving(false);
    toast.success("Planejamento semanal salvo");
    load();
  }

  const numField = (key: keyof WeeklyPlan, label: string, target: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={(plan[key] as number) ?? 0}
          onChange={(e) => setField(key, Number(e.target.value) as WeeklyPlan[typeof key])}
          className="w-24"
        />
        <span className="text-xs text-muted-foreground">meta: {target}</span>
      </div>
    </div>
  );

  const classBg =
    plan.classification === "verde"
      ? "bg-emerald-500/10 border-emerald-500/40"
      : plan.classification === "amarelo"
      ? "bg-amber-500/10 border-amber-500/40"
      : plan.classification === "vermelho"
      ? "bg-destructive/10 border-destructive/40"
      : "border-border/50";

  return (
    <div className="space-y-6">
      <Card className="p-5 bg-card border-border/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs">Início da semana (segunda)</Label>
              <Input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(getMondayOf(new Date(e.target.value + "T12:00:00")))}
                className="w-[180px]"
              />
            </div>
            <div>
              <Label className="text-xs">Método</Label>
              <Select value={plan.method ?? "tatico"} onValueChange={(v) => setField("method", v)}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tatico">Tático</SelectItem>
                  <SelectItem value="operacional">Operacional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {planId && <Badge variant="outline">Plano salvo</Badge>}
          </div>
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Card>

      {/* Revisão da semana anterior */}
      <Card className="p-5 bg-card border-border/50">
        <h3 className="font-semibold mb-3">Revisão da semana anterior</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">O que funcionou bem</Label>
            <Textarea rows={2} value={plan.prev_what_worked ?? ""} onChange={(e) => setField("prev_what_worked", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">O que mais consumiu tempo sem gerar avanço</Label>
            <Textarea rows={2} value={plan.prev_time_wasters ?? ""} onChange={(e) => setField("prev_time_wasters", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Onde houve excesso de alinhamento</Label>
            <Textarea rows={2} value={plan.prev_excess_alignment ?? ""} onChange={(e) => setField("prev_excess_alignment", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Onde houve execução sem alinhamento</Label>
            <Textarea rows={2} value={plan.prev_excess_execution ?? ""} onChange={(e) => setField("prev_excess_execution", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Trava que se repetiu</Label>
            <Textarea rows={2} value={plan.prev_repeated_block ?? ""} onChange={(e) => setField("prev_repeated_block", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold">Única correção para a próxima semana</Label>
            <Textarea
              rows={2}
              value={plan.prev_single_correction ?? ""}
              onChange={(e) => setField("prev_single_correction", e.target.value)}
              className="border-primary/40"
              placeholder="Uma. Não dez."
            />
          </div>
        </div>
      </Card>

      {/* Definição da nova semana */}
      <Card className="p-5 bg-gradient-card border-primary/30">
        <h3 className="font-semibold mb-3">Definição da nova semana</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">O que realmente importa nesta semana</Label>
            <Textarea rows={2} value={plan.week_focus ?? ""} onChange={(e) => setField("week_focus", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Compromissos fixos</Label>
            <Textarea rows={2} value={plan.fixed_commitments ?? ""} onChange={(e) => setField("fixed_commitments", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">O que NÃO entra nesta semana</Label>
            <Textarea rows={2} value={plan.not_this_week ?? ""} onChange={(e) => setField("not_this_week", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Dias com bloco de missão principal reservado</Label>
            <Textarea rows={2} value={plan.mission_blocks ?? ""} onChange={(e) => setField("mission_blocks", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Blocos de 70 destinados às secundárias</Label>
            <Textarea rows={2} value={plan.secondary_blocks ?? ""} onChange={(e) => setField("secondary_blocks", e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Indicadores */}
      <Card className="p-5 bg-card border-border/50">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Painel semanal de evolução
        </h3>
        <div className="grid md:grid-cols-4 gap-4">
          {numField("ind_alignments_done", "Alinhamentos realizados", "5/5")}
          {numField("ind_meetings_under_31", "Reuniões em até 31min", "5/5")}
          {numField("ind_missions_done", "Missões principais concluídas", "≥70%")}
          {numField("ind_blocks_protected", "Blocos de 140 protegidos", "—")}
          {numField("ind_tasks_delegated", "Tarefas delegadas", "—")}
          {numField("ind_tasks_eliminated", "Tarefas eliminadas", "—")}
          {numField("ind_days_tomorrow_defined", "Dias com amanhã definido", "5/5")}
          {numField("ind_interruptions", "Interrupções fora do previsto", "menor")}
        </div>
      </Card>

      {/* Classificação */}
      <Card className={cn("p-5 border", classBg)}>
        <h3 className="font-semibold mb-3">Classificação da semana</h3>
        <div className="grid md:grid-cols-3 gap-3">
          {[
            { v: "verde", label: "Verde", desc: "Semana governada, missão avançou, desvios controlados." },
            { v: "amarelo", label: "Amarelo", desc: "Execução parcial, perda de foco ou excesso de interrupção." },
            { v: "vermelho", label: "Vermelho", desc: "Semana reativa, missão sem proteção, agenda dominada por urgências." },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setField("classification", opt.v)}
              className={cn(
                "text-left p-3 rounded-lg border-2 transition-all",
                plan.classification === opt.v
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:border-border"
              )}
            >
              <div className="font-semibold text-sm">{opt.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{opt.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Label className="text-xs">Anotações livres</Label>
          <Textarea rows={2} value={plan.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} />
        </div>
      </Card>
    </div>
  );
}
