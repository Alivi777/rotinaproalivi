import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, AlertTriangle, Trophy, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type PaymentMethod = { id: string; name: string };

type Mode = "transition" | "won" | "lost";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  targetStageId: string;
  targetStageName: string;
  mode: Mode;
  assigneeId: string | null;
  onConfirmed: () => void;
};

/**
 * Required gate when a client moves between stages.
 *  - "transition": next task + observation
 *  - "won": value + payment method + 2 mandatory tasks (signed contract + clinicorp doc) + observation
 *  - "lost": observation + reason (treated as note) + optional follow-up task
 */
export default function ClientCloseDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  targetStageId,
  targetStageName,
  mode,
  assigneeId,
  onConfirmed,
}: Props) {
  const { user } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [saving, setSaving] = useState(false);

  // shared
  const [note, setNote] = useState("");
  const [messageCopy, setMessageCopy] = useState("");

  // transition / lost task
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState<Date | undefined>(
    new Date(Date.now() + 7 * 86400000)
  );

  // won fields
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("0");
  const [methodId, setMethodId] = useState("");
  const [contractDate, setContractDate] = useState<Date | undefined>(
    new Date(Date.now() + 86400000)
  );
  const [clinicorpDate, setClinicorpDate] = useState<Date | undefined>(
    new Date(Date.now() + 2 * 86400000)
  );

  useEffect(() => {
    if (!open || mode !== "won") return;
    supabase
      .from("payment_methods")
      .select("id, name")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setMethods((data ?? []) as PaymentMethod[]));
  }, [open, mode]);

  function reset() {
    setNote("");
    setMessageCopy("");
    setTaskTitle("");
    setAmount("");
    setCost("0");
    setMethodId("");
  }

  async function confirm() {
    if (!user) return;
    const noteText = note.trim();
    const copyText = messageCopy.trim();
    if (!noteText && !copyText)
      return toast.error("Registre o que foi feito OU cole a cópia da mensagem enviada");
    const finalAssignee = assigneeId || user.id;

    if (mode === "won") {
      if (!amount || parseFloat(amount) <= 0)
        return toast.error("Informe o valor da venda");
      if (!methodId) return toast.error("Selecione a forma de pagamento");
      if (!contractDate) return toast.error("Defina a data do contrato assinado");
      if (!clinicorpDate)
        return toast.error("Defina a data da documentação no Clinicorp");
    } else {
      if (!taskTitle.trim()) return toast.error("Defina a próxima tarefa");
      if (!taskDate) return toast.error("Defina a data da próxima tarefa");
    }

    setSaving(true);

    // Compose body: observação + cópia da mensagem (se ambos existirem)
    const composedBody = [
      noteText && `[→ ${targetStageName}] ${noteText}`,
      copyText && `📋 Cópia da mensagem:\n${copyText}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    // 1) Note (timeline)
    const { error: noteErr } = await supabase.from("client_notes").insert({
      client_id: clientId,
      author_id: user.id,
      body: composedBody,
    });
    if (noteErr) {
      setSaving(false);
      return toast.error(noteErr.message);
    }

    // 2) Tasks
    const tasks =
      mode === "won"
        ? [
            {
              client_id: clientId,
              assigned_to: finalAssignee,
              created_by: user.id,
              title: "Contrato assinado",
              description: "Garantir assinatura do contrato.",
              due_date: format(contractDate!, "yyyy-MM-dd"),
            },
            {
              client_id: clientId,
              assigned_to: finalAssignee,
              created_by: user.id,
              title: "Clinicorp documentado",
              description: "Registrar paciente/atendimento no Clinicorp.",
              due_date: format(clinicorpDate!, "yyyy-MM-dd"),
            },
          ]
        : [
            {
              client_id: clientId,
              assigned_to: finalAssignee,
              created_by: user.id,
              title: taskTitle.trim(),
              due_date: format(taskDate!, "yyyy-MM-dd"),
            },
          ];

    const { error: taskErr } = await supabase.from("client_tasks").insert(tasks);
    if (taskErr) {
      setSaving(false);
      return toast.error(taskErr.message);
    }

    // 3) Sale (only for "won")
    if (mode === "won") {
      const { error: saleErr } = await supabase.from("sales").insert({
        client_id: clientId,
        amount: parseFloat(amount),
        cost: parseFloat(cost) || 0,
        payment_method_id: methodId,
        is_new_patient: true,
        description: `Fechamento — ${targetStageName}`,
        created_by: user.id,
      });
      if (saleErr) {
        setSaving(false);
        return toast.error(saleErr.message);
      }
    }

    // 4) Move stage — também grava o resumo em clients.notes para satisfazer
    //    o trigger enforce_note_on_won_stage e dar contexto direto no card.
    const summary = [
      noteText && `✍️ ${noteText}`,
      copyText && `📋 Mensagem enviada:\n${copyText}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const { error: stageErr } = await supabase
      .from("clients")
      .update({ stage_id: targetStageId, notes: summary })
      .eq("id", clientId);
    if (stageErr) {
      setSaving(false);
      return toast.error(stageErr.message);
    }

    setSaving(false);
    toast.success(`${clientName} → ${targetStageName}`);
    reset();
    onOpenChange(false);
    onConfirmed();
  }

  const Icon =
    mode === "won" ? Trophy : mode === "lost" ? AlertTriangle : ArrowRight;
  const iconClass =
    mode === "won"
      ? "text-primary"
      : mode === "lost"
        ? "text-destructive"
        : "text-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", iconClass)} />
            Mover para {targetStageName}
          </DialogTitle>
          <DialogDescription>
            {mode === "won"
              ? "Para fechar o cliente, preencha valor, forma de pagamento e as tarefas obrigatórias."
              : "Toda mudança de etapa exige próxima tarefa e observação."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "won" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor (R$) *</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Custo (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Forma de pagamento *</Label>
                <Select value={methodId} onValueChange={setMethodId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {methods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
                <div className="text-xs uppercase tracking-widest text-primary font-medium">
                  Tarefas obrigatórias
                </div>
                <div>
                  <Label className="text-sm">📄 Contrato assinado — data *</Label>
                  <DatePopover value={contractDate} onChange={setContractDate} />
                </div>
                <div>
                  <Label className="text-sm">
                    🏥 Clinicorp documentado — data *
                  </Label>
                  <DatePopover value={clinicorpDate} onChange={setClinicorpDate} />
                </div>
                <p className="text-xs text-muted-foreground">
                  As duas tarefas serão criadas automaticamente na rotina do
                  responsável nas datas escolhidas.
                </p>
              </div>
            </>
          )}

          {mode !== "won" && (
            <>
              <div>
                <Label>Próxima tarefa *</Label>
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Ex: Ligar para acompanhar"
                />
              </div>
              <div>
                <Label>Data da tarefa *</Label>
                <DatePopover value={taskDate} onChange={setTaskDate} />
                <p className="text-xs text-muted-foreground mt-1">
                  Aparecerá automaticamente na rotina do responsável neste dia.
                </p>
              </div>
            </>
          )}

          <div>
            <Label>Observação *</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === "won"
                  ? "Resumo do fechamento, condições combinadas…"
                  : mode === "lost"
                    ? "Motivo da perda, aprendizados…"
                    : "O que avançou nessa etapa? Próximos passos…"
              }
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Registrada com data e hora automaticamente no histórico.
            </p>
          </div>

          <Button onClick={confirm} disabled={saving} className="w-full">
            {saving ? "Salvando…" : `Confirmar e mover para ${targetStageName}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DatePopover({
  value,
  onChange,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP", { locale: ptBR }) : "Selecionar data"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
