import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Phone,
  Stethoscope,
  User,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseClientNotesMeta } from "@/lib/clientNotesMeta";
import { openWhatsappWeb } from "@/lib/whatsapp";
import TaskItemCheckDialog from "@/components/TaskItemCheckDialog";
import type { ClientTaskItem } from "@/lib/useClientTaskItems";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  assigned_to: string | null;
  stage_id: string | null;
};

type Props = {
  client: Client;
  items: ClientTaskItem[];
  responsibleName: string;
  onClick: () => void;
};

function isOverdue(taskDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = taskDate.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.getTime() < today.getTime();
}

export default function ReceptionTaskCard({
  client,
  items,
  responsibleName,
  onClick,
}: Props) {
  const [checking, setChecking] = useState<ClientTaskItem | null>(null);

  const meta = useMemo(() => parseClientNotesMeta(client.notes), [client.notes]);
  const pending = items.filter((i) => i.status === "pending");
  const done = items.filter((i) => i.status === "done");
  const taskDate = items[0]?.task_date;
  const overdue = taskDate ? isOverdue(taskDate) && pending.length > 0 : false;
  const allDone = items.length > 0 && pending.length === 0;

  return (
    <>
      <Card
        className={cn(
          "p-3 bg-card hover:border-primary/30 transition-smooth cursor-pointer",
          overdue && "border-destructive bg-destructive/5 ring-1 ring-destructive/40",
          allDone && "border-success/60 bg-success/5",
        )}
        onClick={onClick}
      >
        {meta.doctorName && (
          <div
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded mb-1.5"
            style={{
              background: (meta.doctorColor || "hsl(var(--muted))") + "33",
              color: meta.doctorColor || "hsl(var(--foreground))",
              border: `1px solid ${meta.doctorColor || "hsl(var(--border))"}55`,
            }}
          >
            <Stethoscope className="h-3 w-3" />
            {meta.doctorName}
          </div>
        )}

        {overdue && (
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-destructive mb-1">
            <AlertTriangle className="h-3 w-3" />
            Atrasada
          </div>
        )}

        <div className="font-medium text-sm truncate">{client.name}</div>

        {client.phone && (
          <div className="text-xs text-muted-foreground flex items-center justify-between gap-1 mt-1">
            <span className="flex items-center gap-1 truncate">
              <Phone className="h-3 w-3 shrink-0" /> {client.phone}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openWhatsappWeb(client.phone);
              }}
              className="text-success hover:underline text-[10px] uppercase tracking-wider font-semibold"
              title="Abrir WhatsApp Web"
            >
              WhatsApp
            </button>
          </div>
        )}

        <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
          <User className="h-3 w-3" />
          {responsibleName}
        </div>

        {/* Checklist de tarefas */}
        {items.length > 0 && (
          <div
            className="mt-2.5 pt-2 border-t border-border/40 space-y-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Tarefas do dia</span>
              <Badge variant={allDone ? "default" : "secondary"} className="h-4 text-[10px] px-1.5">
                {done.length}/{items.length}
              </Badge>
            </div>
            {items.map((item) => {
              const isDone = item.status === "done";
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-2 text-xs rounded px-1.5 py-1",
                    isDone && "opacity-60 line-through",
                    !isDone && "hover:bg-secondary/50",
                  )}
                >
                  <Checkbox
                    checked={isDone}
                    disabled={isDone}
                    onCheckedChange={() => {
                      if (!isDone) setChecking(item);
                    }}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="flex-1 leading-tight">{item.task_label}</span>
                  {isDone ? (
                    <CheckCircle2 className="h-3 w-3 text-success shrink-0 mt-0.5" />
                  ) : overdue ? (
                    <Clock className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <TaskItemCheckDialog
        open={!!checking}
        onOpenChange={(v) => !v && setChecking(null)}
        item={checking}
        clientName={client.name}
      />
    </>
  );
}
