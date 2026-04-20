import { useState } from "react";
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
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  targetStageId: string;
  targetStageName: string;
  assigneeId: string | null;
  onConfirmed: () => void;
};

/**
 * Forces user to register a next task + observation before closing/losing a client.
 */
export default function ClientCloseDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  targetStageId,
  targetStageName,
  assigneeId,
  onConfirmed,
}: Props) {
  const { user } = useAuth();
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState<Date | undefined>(
    new Date(Date.now() + 7 * 86400000)
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!taskTitle.trim()) return toast.error("Defina a próxima tarefa");
    if (!taskDate) return toast.error("Defina a data da próxima tarefa");
    if (!note.trim()) return toast.error("Registre uma observação");
    if (!user) return;
    const finalAssignee = assigneeId || user.id;
    setSaving(true);
    const dueDate = format(taskDate, "yyyy-MM-dd");

    const { error: noteErr } = await supabase.from("client_notes").insert({
      client_id: clientId,
      author_id: user.id,
      body: note.trim(),
    });
    if (noteErr) {
      setSaving(false);
      return toast.error(noteErr.message);
    }

    const { error: taskErr } = await supabase.from("client_tasks").insert({
      client_id: clientId,
      assigned_to: finalAssignee,
      created_by: user.id,
      title: taskTitle.trim(),
      due_date: dueDate,
    });
    if (taskErr) {
      setSaving(false);
      return toast.error(taskErr.message);
    }

    const { error: stageErr } = await supabase
      .from("clients")
      .update({ stage_id: targetStageId })
      .eq("id", clientId);
    if (stageErr) {
      setSaving(false);
      return toast.error(stageErr.message);
    }

    setSaving(false);
    toast.success(`${clientName} → ${targetStageName}`);
    setTaskTitle("");
    setNote("");
    onOpenChange(false);
    onConfirmed();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Mover para {targetStageName}
          </DialogTitle>
          <DialogDescription>
            Nenhum cliente é fechado sem próxima tarefa e observação. Preencha
            abaixo para continuar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !taskDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {taskDate
                    ? format(taskDate, "PPP", { locale: ptBR })
                    : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={taskDate}
                  onSelect={setTaskDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground mt-1">
              Aparecerá automaticamente na rotina do responsável neste dia.
            </p>
          </div>
          <div>
            <Label>Observação *</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="O que conversaram? Resultado, próximos passos…"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Registrada com data e hora automaticamente no histórico do cliente.
            </p>
          </div>
          <Button onClick={confirm} disabled={saving} className="w-full">
            {saving ? "Salvando…" : "Confirmar e mover"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
