import { useState } from "react";
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

/**
 * Dialog para concluir UM item da checklist do card.
 * Exige nota OU cópia da mensagem (igual à regra do card principal).
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
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!item || !user) return;
    const noteText = note.trim();
    const copyText = messageCopy.trim();
    if (!noteText && !copyText)
      return toast.error("Registre o que foi feito OU cole a cópia da mensagem");

    setSaving(true);
    const { error } = await supabase
      .from("client_task_items")
      .update({
        status: "done",
        note: noteText || null,
        message_copy: copyText || null,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
      })
      .eq("id", item.id);

    if (!error && item.daily_task_id) {
      // Marca a tarefa original na agenda clínica como concluída também
      await supabase
        .from("clinic_daily_tasks")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
          completed_by: user.id,
        })
        .eq("id", item.daily_task_id);
    }

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Tarefa concluída");
    setNote("");
    setMessageCopy("");
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
            <Label>✍️ O que foi feito (observação)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Resumo rápido da execução…"
            />
          </div>
          <div>
            <Label>📋 Cópia da mensagem enviada</Label>
            <Textarea
              value={messageCopy}
              onChange={(e) => setMessageCopy(e.target.value)}
              rows={3}
              placeholder="Cole aqui o conteúdo enviado pelo WhatsApp"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Para concluir é obrigatório registrar pelo menos um dos dois.
          </p>

          <Button onClick={confirm} disabled={saving} className="w-full">
            {saving ? "Salvando…" : "Concluir tarefa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
