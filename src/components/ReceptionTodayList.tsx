import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarDays, Phone, Stethoscope, User, AlertTriangle, MessageCircle } from "lucide-react";
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
};

type Profile = { user_id: string; display_name: string | null };

type Props = {
  clients: Client[];
  profiles: Profile[];
  taskItemsByClient: Map<string, ClientTaskItem[]>;
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Lista única de tarefas de HOJE no formato da página /rotina:
 * checkbox à esquerda + título + cliente/responsável + descrição.
 * Cada linha = 1 tarefa do checklist (não 1 cliente).
 */
export default function ReceptionTodayList({ clients, profiles, taskItemsByClient }: Props) {
  const [checking, setChecking] = useState<{ item: ClientTaskItem; clientName: string } | null>(null);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const today = todayKey();

  const rows = useMemo(() => {
    const list: { item: ClientTaskItem; client: Client; meta: ReturnType<typeof parseClientNotesMeta> }[] = [];
    for (const [clientId, items] of taskItemsByClient.entries()) {
      const client = clientById.get(clientId);
      if (!client) continue;
      const meta = parseClientNotesMeta(client.notes);
      for (const item of items) {
        if (item.task_date !== today) continue;
        list.push({ item, client, meta });
      }
    }
    // pendentes primeiro, depois por nome do cliente
    list.sort((a, b) => {
      const ad = a.item.status === "done" ? 1 : 0;
      const bd = b.item.status === "done" ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return a.client.name.localeCompare(b.client.name);
    });
    return list;
  }, [taskItemsByClient, clientById, today]);

  const pending = rows.filter((r) => r.item.status === "pending").length;
  const done = rows.length - pending;

  if (rows.length === 0) {
    return (
      <Card className="p-12 text-center bg-gradient-card border-border/50">
        <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">
          Nenhuma tarefa para hoje. Use “Sincronizar tarefas da semana”.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6 bg-card border-border/50">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">Tarefas de hoje</h2>
            <p className="text-xs text-muted-foreground">
              Marque cada item ao concluir. Abre janela para registrar comentário ou cópia da mensagem.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {pending} pendentes
            </Badge>
            <Badge variant="default" className="text-xs bg-success/20 text-success hover:bg-success/30">
              {done} feitas
            </Badge>
          </div>
        </div>

        <ul className="divide-y divide-border/50">
          {rows.map(({ item, client, meta }) => {
            const isDone = item.status === "done";
            const responsibleName = client.assigned_to
              ? profileById.get(client.assigned_to)?.display_name || "Sem responsável"
              : "— Sem responsável —";

            return (
              <li
                key={item.id}
                className={cn(
                  "py-4 flex items-start gap-4 group transition-smooth",
                  isDone && "opacity-60",
                )}
              >
                <Checkbox
                  checked={isDone}
                  disabled={isDone}
                  onCheckedChange={() => {
                    if (!isDone) setChecking({ item, clientName: client.name });
                  }}
                  className="mt-1 h-5 w-5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "font-medium",
                        isDone && "line-through text-muted-foreground",
                      )}
                    >
                      {item.task_label}
                    </span>
                    {meta.doctorName && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          background: (meta.doctorColor || "hsl(var(--muted))") + "33",
                          color: meta.doctorColor || "hsl(var(--foreground))",
                          border: `1px solid ${meta.doctorColor || "hsl(var(--border))"}55`,
                        }}
                      >
                        <Stethoscope className="h-3 w-3" />
                        {meta.doctorName}
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-medium text-foreground/80">{client.name}</span>
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {client.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {responsibleName}
                    </span>
                  </div>

                  {item.task_howto && (
                    <p className="text-xs text-muted-foreground/90 mt-1">{item.task_howto}</p>
                  )}
                </div>

                {client.phone && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openWhatsappWeb(client.phone);
                    }}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-success hover:underline"
                    title="Abrir WhatsApp Web"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <TaskItemCheckDialog
        open={!!checking}
        onOpenChange={(v) => !v && setChecking(null)}
        item={checking?.item ?? null}
        clientName={checking?.clientName ?? ""}
      />
    </>
  );
}
