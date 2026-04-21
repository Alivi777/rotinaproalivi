import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  Stethoscope,
  User,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseClientNotesMeta, extractApptIso } from "@/lib/clientNotesMeta";
import { openWhatsappWeb } from "@/lib/whatsapp";
import { spToday } from "@/lib/spTime";
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

/** Comparação de "atrasado" usando data SP (YYYY-MM-DD strings comparáveis). */
function isOverdueSP(taskDate: string): boolean {
  return taskDate < spToday();
}

/** HH:mm em SP a partir de ISO. */
function fmtTimeSP(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export default function ReceptionTaskCard({
  client,
  items,
  responsibleName,
  onClick,
}: Props) {
  const [checking, setChecking] = useState<ClientTaskItem | null>(null);

  const meta = useMemo(() => parseClientNotesMeta(client.notes), [client.notes]);
  const apptIso = useMemo(() => extractApptIso(client.notes), [client.notes]);
  const apptTime = useMemo(() => fmtTimeSP(apptIso), [apptIso]);
  const pending = items.filter((i) => i.status === "pending");
  const done = items.filter((i) => i.status === "done");
  const nextPending = pending[0] ?? null;
  const taskDate = items[0]?.task_date;
  const overdue = taskDate ? isOverdueSP(taskDate) && pending.length > 0 : false;
  const allDone = items.length > 0 && pending.length === 0;

  return (
    <>
      <Card
        className={cn(
          "relative p-3 pr-12 bg-card hover:border-primary/30 transition-smooth cursor-pointer",
          overdue && "border-destructive bg-destructive/5 ring-1 ring-destructive/40",
          allDone && "border-success/60 bg-success/5",
        )}
        onClick={onClick}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (nextPending) setChecking(nextPending);
          }}
          disabled={!nextPending}
          className={cn(
            "absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
            allDone && "border-success bg-success text-success-foreground",
            !allDone && overdue && "border-destructive bg-destructive/10 text-destructive animate-pulse",
            !allDone && !overdue && "border-primary bg-primary/10 text-primary hover:bg-primary/15",
            !nextPending && "cursor-default",
          )}
          title={allDone ? "Todas as tarefas concluídas" : "Concluir próxima tarefa"}
        >
          {allDone ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <span className={cn("h-2.5 w-2.5 rounded-full", overdue ? "bg-destructive" : "bg-primary")} />
          )}
        </button>

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

        <div className="flex items-center gap-2 flex-wrap">
          {apptTime && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              <Clock className="h-3 w-3" />
              {apptTime}
            </span>
          )}
          <div className="font-medium text-sm truncate">{client.name}</div>
        </div>

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

        {items.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-border/40 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Tarefas do dia</span>
              <Badge variant={allDone ? "default" : "secondary"} className="h-4 text-[10px] px-1.5">
                {done.length}/{items.length}
              </Badge>
            </div>
            {items.map((item) => {
              const isDone = item.status === "done";
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isDone}
                  onClick={() => {
                    if (!isDone) setChecking(item);
                  }}
                  className={cn(
                    "w-full flex items-start gap-2 text-xs rounded px-1.5 py-1 text-left transition-colors",
                    isDone && "opacity-60 line-through cursor-default",
                    !isDone && "hover:bg-primary/10 hover:ring-1 hover:ring-primary/40 cursor-pointer",
                  )}
                  title={isDone ? "Concluída" : "Clique para concluir esta tarefa"}
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full border-2",
                      isDone
                        ? "bg-success border-success text-success-foreground"
                        : overdue
                          ? "border-destructive bg-destructive/10"
                          : "border-primary bg-primary/10",
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <span className={cn("h-1.5 w-1.5 rounded-full", overdue ? "bg-destructive" : "bg-primary")} />
                    )}
                  </span>
                  <span className="flex-1 leading-tight">{item.task_label}</span>
                  {!isDone && overdue && (
                    <Clock className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                  )}
                </button>
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
