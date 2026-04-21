import { useState } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { ClientTaskItem } from "@/lib/useClientTaskItems";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ClientTaskItem | null;
  clientName: string;
  onDone?: () => void;
};

const completionSchema = z
  .object({
    note: z.string().trim().max(1000, "Comentário muito longo"),
    messageCopy: z.string().trim().max(4000, "Cópia da mensagem muito longa"),
    nextTask: z.string().trim().max(500, "Próxima tarefa muito longa"),
  })
  .refine((data) => data.note.length > 0 || data.messageCopy.length > 0, {
    message: "Registre o que foi feito OU cole a cópia da mensagem",
    path: ["note"],
  });

/**
 * Dialog para concluir UM item da checklist do card.
 * Exige nota OU cópia da mensagem e permite registrar a próxima tarefa.
 */
export default function TaskItemCheckDialog({
  open,
  onOpenChange,
  item,
  clientName,
  onDone,
}: Props) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [messageCopy, setMessageCopy] = useState("");
  const [nextTask, setNextTask] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!item || !user) return;

    const parsed = completionSchema.safeParse({ note, messageCopy, nextTask });
    if (!parsed.success) {
      return toast.error(parsed.error.issues[0]?.message || "Dados inválidos");
    }

    const noteText = parsed.data.note;
    const copyText = parsed.data.messageCopy;
    const nextTaskText = parsed.data.nextTask;
    const combinedNote = [
      noteText,
      nextTaskText ? `Próxima tarefa: ${nextTaskText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    setSaving(true);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("client_task_items")
      .update({
        status: "done",
        note: combinedNote || null,
        message_copy: copyText || null,
        completed_at: now,
        completed_by: user.id,
      })
      .eq("id", item.id);

    if (!error && item.daily_task_id) {
      await supabase
        .from("clinic_daily_tasks")
        .update({
          status: "done",
          completed_at: now,
          completed_by: user.id,
          notes: combinedNote || null,
        })
        .eq("id", item.daily_task_id);
    }

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Tarefa concluída");
    setNote("");
    setMessageCopy("");
    setNextTask("");
    onOpenChange(false);
    onDone?.();
  }

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Concluir tarefa
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{clientName}</span>
            <br />
            {item.task_label}
          </DialogDescription>
        </DialogHeader>

        {item.task_howto && (
          <div className="rounded-md bg-secondary/40 border border-border/50 p-3 text-sm">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Como fazer
            </span>
            <p className="mt-1">{item.task_howto}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label>✍️ Comentário do que foi feito</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Resumo rápido da execução…"
            />
          </div>
          <div>
            <Label>📋 Cópia / print da mensagem</Label>
            <Textarea
              value={messageCopy}
              onChange={(e) => setMessageCopy(e.target.value)}
              rows={3}
              placeholder="Cole aqui o conteúdo enviado pelo WhatsApp"
            />
          </div>
          <div>
            <Label>🗓️ Próxima tarefa futura</Label>
            <Textarea
              value={nextTask}
              onChange={(e) => setNextTask(e.target.value)}
              rows={2}
              placeholder="Ex.: confirmar retorno em 2 dias"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Para concluir é obrigatório registrar comentário ou cópia da mensagem.
          </p>

          <Button onClick={confirm} disabled={saving} className="w-full">
            {saving ? "Salvando…" : "Concluir tarefa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
