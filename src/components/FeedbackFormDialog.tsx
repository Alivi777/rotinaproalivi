import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type Member = { user_id: string; display_name: string | null };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  members: Member[];
  initial?: any;
  onSaved: () => void;
};

const monthFirstIso = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function FeedbackFormDialog({
  open,
  onOpenChange,
  members,
  initial,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    user_id: "",
    feedback_type: "feedback",
    week_of_month: 2,
    reference_date: new Date().toISOString().slice(0, 10),
    reference_month: monthFirstIso(),
    role: "",
    department: "",
    period_start: monthFirstIso(),
    period_end: "",
    next_alignment_date: "",
    last_week_numbers: "",
    last_week_conversion: "",
    last_week_organization: "",
    last_week_closings: "",
    last_week_behavior: "",
    last_week_hit_goal: "",
    last_week_focus_energy: "",
    needs_improvement: "",
    commitment_meetings: "",
    commitment_goal: "",
    commitment_how: "",
    attitude_1: "",
    attitude_2: "",
    attitude_3: "",
    observation: "",
    deliverables: "",
    expected_behavior: "",
    non_negotiables: "",
    closing_message: "",
  });

  useEffect(() => {
    if (initial) {
      setForm({ ...form, ...initial });
    } else if (open) {
      setForm((f: any) => ({
        ...f,
        user_id: members[0]?.user_id || "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open]);

  const isContract = form.feedback_type === "contract";

  function set<K extends string>(k: K, v: any) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.user_id) return toast.error("Selecione o colaborador");
    setBusy(true);
    const payload = {
      ...form,
      manager_id: user?.id,
      week_of_month: Number(form.week_of_month) || 1,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      next_alignment_date: form.next_alignment_date || null,
    };
    const { error } = initial?.id
      ? await supabase
          .from("team_feedbacks")
          .update(payload)
          .eq("id", initial.id)
      : await supabase.from("team_feedbacks").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(initial?.id ? "Feedback atualizado" : "Feedback criado");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? "Editar" : "Novo"}{" "}
            {isContract ? "contrato de expectativa" : "feedback semanal"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Tabs
            value={form.feedback_type}
            onValueChange={(v) => set("feedback_type", v)}
          >
            <TabsList>
              <TabsTrigger value="contract">Contrato (Semana 1)</TabsTrigger>
              <TabsTrigger value="feedback">Feedback semanal</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Colaborador</Label>
              <Select
                value={form.user_id}
                onValueChange={(v) => set("user_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name || "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Semana do mês</Label>
              <Select
                value={String(form.week_of_month)}
                onValueChange={(v) => set("week_of_month", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Semana 1 (Contrato)</SelectItem>
                  <SelectItem value="2">Semana 2</SelectItem>
                  <SelectItem value="3">Semana 3</SelectItem>
                  <SelectItem value="4">Semana 4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cargo</Label>
              <Input
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
              />
            </div>
            <div>
              <Label>Departamento</Label>
              <Input
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
              />
            </div>
            <div>
              <Label>Início do período</Label>
              <Input
                type="date"
                value={form.period_start || ""}
                onChange={(e) => set("period_start", e.target.value)}
              />
            </div>
            <div>
              <Label>Fim do período</Label>
              <Input
                type="date"
                value={form.period_end || ""}
                onChange={(e) => set("period_end", e.target.value)}
              />
            </div>
            <div>
              <Label>Data de referência</Label>
              <Input
                type="date"
                value={form.reference_date}
                onChange={(e) => set("reference_date", e.target.value)}
              />
            </div>
            <div>
              <Label>Próximo alinhamento</Label>
              <Input
                type="date"
                value={form.next_alignment_date || ""}
                onChange={(e) => set("next_alignment_date", e.target.value)}
              />
            </div>
          </div>

          {isContract ? (
            <div className="space-y-3">
              <div>
                <Label>Entregáveis / Metas</Label>
                <Textarea
                  rows={5}
                  value={form.deliverables}
                  onChange={(e) => set("deliverables", e.target.value)}
                  placeholder="Ex: Mínimo 100 clientes/dia, meta semanal R$50k..."
                />
              </div>
              <div>
                <Label>Comportamento / Atitude / Postura</Label>
                <Textarea
                  rows={5}
                  value={form.expected_behavior}
                  onChange={(e) => set("expected_behavior", e.target.value)}
                  placeholder="Ex: Verdade e transparência, disciplina..."
                />
              </div>
              <div>
                <Label>Inegociáveis da empresa</Label>
                <Textarea
                  rows={4}
                  value={form.non_negotiables}
                  onChange={(e) => set("non_negotiables", e.target.value)}
                  placeholder="Ex: Não está no CRM, não foi feito..."
                />
              </div>
              <div>
                <Label>Mensagem de fechamento (opcional)</Label>
                <Textarea
                  rows={3}
                  value={form.closing_message}
                  onChange={(e) => set("closing_message", e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Análise da última semana
              </h3>
              <div className="grid md:grid-cols-2 gap-3">
                <Field
                  label="Números"
                  v={form.last_week_numbers}
                  on={(v) => set("last_week_numbers", v)}
                />
                <Field
                  label="Conversão"
                  v={form.last_week_conversion}
                  on={(v) => set("last_week_conversion", v)}
                />
                <Field
                  label="Organização"
                  v={form.last_week_organization}
                  on={(v) => set("last_week_organization", v)}
                />
                <Field
                  label="Fechamentos"
                  v={form.last_week_closings}
                  on={(v) => set("last_week_closings", v)}
                />
                <Field
                  label="Comportamento"
                  v={form.last_week_behavior}
                  on={(v) => set("last_week_behavior", v)}
                />
                <Field
                  label="Atingiu a meta?"
                  v={form.last_week_hit_goal}
                  on={(v) => set("last_week_hit_goal", v)}
                />
                <Field
                  label="Foco e energia"
                  v={form.last_week_focus_energy}
                  on={(v) => set("last_week_focus_energy", v)}
                />
                <Field
                  label="O que precisa aprimorar"
                  v={form.needs_improvement}
                  on={(v) => set("needs_improvement", v)}
                />
              </div>

              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground pt-2">
                Compromisso da semana
              </h3>
              <div className="grid md:grid-cols-2 gap-3">
                <Field
                  label="Nº de reuniões necessárias"
                  v={form.commitment_meetings}
                  on={(v) => set("commitment_meetings", v)}
                />
                <Field
                  label="Meta da semana"
                  v={form.commitment_goal}
                  on={(v) => set("commitment_goal", v)}
                />
              </div>
              <div>
                <Label>O que fará para atingir?</Label>
                <Textarea
                  rows={3}
                  value={form.commitment_how}
                  onChange={(e) => set("commitment_how", e.target.value)}
                />
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <Field
                  label="Atitude 1 (indicador)"
                  v={form.attitude_1}
                  on={(v) => set("attitude_1", v)}
                />
                <Field
                  label="Atitude 2 (indicador)"
                  v={form.attitude_2}
                  on={(v) => set("attitude_2", v)}
                />
                <Field
                  label="Atitude 3 (indicador)"
                  v={form.attitude_3}
                  on={(v) => set("attitude_3", v)}
                />
              </div>
            </div>
          )}

          <div>
            <Label>Observação e acordo</Label>
            <Textarea
              rows={3}
              value={form.observation}
              onChange={(e) => set("observation", e.target.value)}
            />
          </div>

          <Button onClick={save} disabled={busy} className="w-full gap-2">
            <Save className="h-4 w-4" />
            {busy ? "Salvando..." : "Salvar feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  v,
  on,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={v || ""} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
