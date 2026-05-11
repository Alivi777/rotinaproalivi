import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  AlertOctagon,
  MessageSquareText,
  Clock,
} from "lucide-react";
import { spToday } from "@/lib/spTime";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import ReceptionTaskCard from "@/components/ReceptionTaskCard";
import TaskItemCheckDialog from "@/components/TaskItemCheckDialog";
import { openWhatsappWeb } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { parseClientNotesMeta } from "@/lib/clientNotesMeta";
import type { ClientTaskItem } from "@/lib/useClientTaskItems";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  assigned_to: string | null;
  stage_id: string | null;
};

type Profile = { user_id: string; display_name: string | null };

type PendingAttendance = {
  id: string;
  from_phone: string;
  from_name: string | null;
  client_id: string | null;
  last_message_at: string;
  assigned_to: string | null;
};

type Props = {
  clients: Client[];
  profiles: Profile[];
  taskItemsByClient: Map<string, ClientTaskItem[]>;
  onOpenClient: (client: Client) => void;
};

type ColumnKey = "novo" | "programadas" | "concluidos";

// Colunas fixas da Recepção: Agenda Hoje + D-7..D-1 (sempre do dia atual).
const TASK_COLUMNS: { key: string; title: string; subtitle: string; types: string[] }[] = [
  { key: "agenda_hoje", title: "Agenda Hoje", subtitle: "Consulta do dia", types: ["appointment", "birthday"] },
  { key: "d7", title: "D-7", subtitle: "Confirmar (D-7)", types: ["confirm_d7"] },
  { key: "d6", title: "D-6", subtitle: "Confirmar (D-6)", types: ["confirm_d6"] },
  { key: "d5", title: "D-5", subtitle: "Confirmar (D-5)", types: ["confirm_d5"] },
  { key: "d4", title: "D-4", subtitle: "Confirmar (D-4)", types: ["confirm_d4"] },
  { key: "d3", title: "D-3", subtitle: "Protocolo falta confirmação", types: ["protocol_d3"] },
  { key: "d2", title: "D-2", subtitle: "Urgência / escassez", types: ["urgency_d2"] },
  { key: "d1", title: "D-1", subtitle: "Confirmação desmarque", types: ["unbook_confirm_d1"] },
];

/**
 * Funil de Execução da Recepção — 3 colunas fixas:
 *   1) Novo Atendimento (WhatsApp pending)
 *   2) Programadas (pacientes com tarefas de HOJE pendentes)
 *   3) Concluídos (todas as tarefas de hoje feitas)
 *
 * Drag-and-drop: arrastar um card para "Concluídos" marca a próxima
 * tarefa pendente como feita; arrastar para "Programadas" reabre.
 */
export default function ReceptionTodayCards({
  clients,
  profiles,
  taskItemsByClient,
  onOpenClient,
}: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttendance[]>([]);
  const [overCol, setOverCol] = useState<ColumnKey | null>(null);
  const [checking, setChecking] = useState<{ item: ClientTaskItem; clientName: string } | null>(null);

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.user_id, p])),
    [profiles],
  );
  const today = spToday();

  // ---- Carrega novos atendimentos do WhatsApp ----
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("whatsapp_pending_attendances")
        .select("id, from_phone, from_name, client_id, last_message_at, assigned_to")
        .eq("status", "waiting")
        .order("last_message_at", { ascending: true });
      if (!cancelled) setPending((data ?? []) as PendingAttendance[]);
    }
    load();
    const ch = supabase
      .channel("recepcao-funil-wpa")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_pending_attendances" },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  // ---- Mapa de doutor por cliente (a partir de notes meta) ----
  const doctorByClient = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const c of clients) {
      const meta = parseClientNotesMeta(c.notes);
      if (meta.doctorName) {
        map.set(c.id, { name: meta.doctorName, color: meta.doctorColor ?? null });
      }
    }
    return map;
  }, [clients]);

  // Lista de doutores com tarefas de hoje (para chips)
  const doctorChips = useMemo(() => {
    const seen = new Map<string, { name: string; color: string | null; count: number }>();
    for (const c of clients) {
      const all = taskItemsByClient.get(c.id) ?? [];
      const hasToday = all.some((i) => i.task_date === today);
      if (!hasToday) continue;
      const d = doctorByClient.get(c.id);
      if (!d) continue;
      const cur = seen.get(d.name);
      if (cur) cur.count += 1;
      else seen.set(d.name, { name: d.name, color: d.color, count: 1 });
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, taskItemsByClient, today, doctorByClient]);

  // ---- Mapeia 1 CARD por TAREFA de HOJE (nunca agrupa várias tarefas no mesmo card) ----
  const cardsToday = useMemo(() => {
    const list: { client: Client; items: ClientTaskItem[]; allDone: boolean; key: string }[] = [];
    for (const client of clients) {
      // "Agenda Geral" pertence ao SDR e não deve aparecer na Recepção
      const docMeta = doctorByClient.get(client.id);
      if (docMeta?.name?.trim().toLowerCase() === "agenda geral") continue;
      const all = taskItemsByClient.get(client.id) ?? [];
      const todayItems = all.filter((i) => i.task_date === today);
      if (todayItems.length === 0) continue;
      if (search && !client.name.toLowerCase().includes(search.toLowerCase())) continue;
      if (doctorFilter) {
        const d = doctorByClient.get(client.id);
        if (!d || d.name !== doctorFilter) continue;
      }
      for (const item of todayItems) {
        list.push({
          client,
          items: [item],
          allDone: item.status === "done",
          key: item.id,
        });
      }
    }
    list.sort((a, b) => {
      const an = a.client.name.localeCompare(b.client.name);
      if (an !== 0) return an;
      return a.items[0].sort_order - b.items[0].sort_order;
    });
    return list;
  }, [clients, taskItemsByClient, today, search, doctorFilter, doctorByClient]);

  const programadas = cardsToday.filter((c) => !c.allDone);
  const concluidos = cardsToday.filter((c) => c.allDone);

  // Filtra novos atendimentos por busca (chip de doutor oculta a coluna)
  const novosFiltrados = useMemo(() => {
    if (doctorFilter) return [] as PendingAttendance[];
    if (!search) return pending;
    const q = search.toLowerCase();
    return pending.filter(
      (p) =>
        (p.from_name ?? "").toLowerCase().includes(q) ||
        (p.from_phone ?? "").includes(q),
    );
  }, [pending, search, doctorFilter]);

  // ---- Drag handlers (1 tarefa por card => arrasta o item específico) ----
  function onDragStart(e: React.DragEvent, itemId: string) {
    e.dataTransfer.setData("text/plain", itemId);
    e.dataTransfer.effectAllowed = "move";
  }

  async function onDropCol(e: React.DragEvent, target: ColumnKey) {
    e.preventDefault();
    setOverCol(null);
    const itemId = e.dataTransfer.getData("text/plain");
    if (!itemId) return;
    // Localiza o item arrastado
    let dragged: ClientTaskItem | null = null;
    let draggedClientId: string | null = null;
    for (const [cid, arr] of taskItemsByClient.entries()) {
      const found = arr.find((i) => i.id === itemId);
      if (found) {
        dragged = found;
        draggedClientId = cid;
        break;
      }
    }
    if (!dragged || !draggedClientId) return;

    if (target === "concluidos") {
      if (dragged.status === "done") return;
      const client = clients.find((c) => c.id === draggedClientId);
      setChecking({ item: dragged, clientName: client?.name ?? "" });
    } else if (target === "programadas") {
      if (dragged.status !== "done") return;
      const { error } = await supabase
        .from("client_task_items")
        .update({ status: "pending", completed_at: null, completed_by: null })
        .eq("id", dragged.id);
      if (error) return toast.error(error.message);
      if (dragged.daily_task_id) {
        await supabase
          .from("clinic_daily_tasks")
          .update({ status: "pending", completed_at: null, completed_by: null })
          .eq("id", dragged.daily_task_id);
      }
      toast.message(`Tarefa "${dragged.task_label}" reaberta`);
    }
  }

  function onDragOverCol(e: React.DragEvent, col: ColumnKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overCol !== col) setOverCol(col);
  }

  async function attendNow(att: PendingAttendance) {
    const { error } = await supabase
      .from("whatsapp_pending_attendances")
      .update({
        status: "attended",
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
      })
      .eq("id", att.id);
    if (error) return toast.error(error.message);
    toast.success("Atendimento marcado como feito");
    openWhatsappWeb(att.from_phone);
  }

  const totalToday = cardsToday.length;
  const doneCount = concluidos.length;
  const pendingCount = programadas.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Funil da Recepção</h2>
          <p className="text-xs text-muted-foreground">
            {pending.length} novos · {pendingCount} programados · {doneCount} concluídos
            {doctorFilter && ` · filtrando: ${doctorFilter}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar paciente por nome ou telefone..."
              className="pl-7 h-8 w-64 text-xs"
            />
          </div>
          {search && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => setSearch("")}
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      {doctorChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            Doutor:
          </span>
          <button
            type="button"
            onClick={() => setDoctorFilter(null)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs border transition-colors",
              doctorFilter === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/50 border-border hover:bg-secondary",
            )}
          >
            Todos
          </button>
          {doctorChips.map((d) => {
            const active = doctorFilter === d.name;
            return (
              <button
                key={d.name}
                type="button"
                onClick={() => setDoctorFilter(active ? null : d.name)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs border transition-colors",
                  active
                    ? "text-primary-foreground border-transparent"
                    : "bg-secondary/50 border-border hover:bg-secondary",
                )}
                style={
                  active
                    ? {
                        background: d.color || "hsl(var(--primary))",
                        borderColor: d.color || "hsl(var(--primary))",
                      }
                    : undefined
                }
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: d.color || "hsl(var(--muted-foreground))" }}
                />
                {d.name}
                <Badge variant="secondary" className="h-4 text-[10px] px-1">
                  {d.count}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      {/* Banner — Novo Atendimento WhatsApp (sempre no topo) */}
      {novosFiltrados.length > 0 && (
        <Card className="p-3 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon className="h-4 w-4 text-destructive" />
            <h3 className="font-semibold text-sm">Novo Atendimento</h3>
            <Badge variant="destructive" className="h-5 text-[10px]">
              {novosFiltrados.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {novosFiltrados.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md border border-destructive/30 bg-background"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">
                    {att.from_name || "Contato sem nome"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {att.from_phone} · {minutesAgo(att.last_message_at)} min
                  </div>
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={() => attendNow(att)}>
                  <MessageSquareText className="h-3 w-3 mr-1" />
                  Atender
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Kanban — colunas Agenda Hoje + D-7..D-1, agrupado por responsável */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        {TASK_COLUMNS.map((col) => {
          const colCards = cardsToday.filter((c) =>
            col.types.includes(c.items[0].task_type),
          );

          // Agrupar por responsável (nome do doutor; cai p/ "Sem responsável")
          const byResp = new Map<
            string,
            { color: string | null; cards: typeof colCards }
          >();
          for (const c of colCards) {
            const d = doctorByClient.get(c.client.id);
            const name = d?.name || "Sem responsável";
            const cur = byResp.get(name);
            if (cur) cur.cards.push(c);
            else byResp.set(name, { color: d?.color ?? null, cards: [c] });
          }
          const groups = Array.from(byResp.entries()).sort((a, b) =>
            a[0].localeCompare(b[0]),
          );

          return (
            <section
              key={col.key}
              className="rounded-xl bg-secondary/30 border border-border/50 p-2 min-h-[200px]"
            >
              <header className="flex items-center justify-between mb-2 px-1">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm leading-none truncate">
                    {col.title}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {col.subtitle}
                  </p>
                </div>
                <Badge variant="secondary" className="h-5 text-xs">
                  {colCards.length}
                </Badge>
              </header>

              <div className="space-y-3">
                {groups.length === 0 && (
                  <EmptyHint text="Sem tarefas" />
                )}
                {groups.map(([respName, { color, cards }]) => (
                  <div key={respName} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 px-1">
                      <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ background: color || "hsl(var(--muted-foreground))" }}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                        {respName}
                      </span>
                      <Badge variant="outline" className="h-4 text-[9px] px-1 ml-auto">
                        {cards.length}
                      </Badge>
                    </div>
                    {cards.map(({ client, items, key }) => (
                      <ReceptionTaskCard
                        key={key}
                        client={client}
                        items={items}
                        responsibleName={
                          client.assigned_to
                            ? profileById.get(client.assigned_to)?.display_name ||
                              "Sem responsável"
                            : "— Sem responsável —"
                        }
                        onClick={() => onOpenClient(client)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {totalToday === 0 && pending.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma tarefa para hoje. Use “Sincronizar agendas da semana”.
        </Card>
      )}

      <TaskItemCheckDialog
        open={!!checking}
        onOpenChange={(v) => !v && setChecking(null)}
        item={checking?.item ?? null}
        clientName={checking?.clientName ?? ""}
      />
    </div>
  );
}

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

const EmptyHint = React.forwardRef<HTMLDivElement, { text: string }>(
  function EmptyHint({ text }, ref) {
    return (
      <div
        ref={ref}
        className="text-xs text-muted-foreground/60 text-center py-8 border border-dashed border-border/40 rounded-lg"
      >
        {text}
      </div>
    );
  },
);

type FunnelColumnProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: "destructive" | "primary" | "success";
  count: number;
  children: React.ReactNode;
  highlight?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
};

const FunnelColumn = React.forwardRef<HTMLElement, FunnelColumnProps>(
  function FunnelColumn(
    { title, subtitle, icon, accent, count, children, highlight, onDragOver, onDragLeave, onDrop },
    ref,
  ) {
    const accentRing =
      accent === "destructive"
        ? "ring-destructive/40"
        : accent === "success"
          ? "ring-success/40"
          : "ring-primary/40";

    return (
      <section
        ref={ref}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "rounded-xl bg-secondary/30 border border-border/50 p-3 min-h-[200px] transition-all",
          highlight && `bg-secondary/60 ring-2 ${accentRing}`,
        )}
      >
        <header className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <h3 className="font-semibold text-sm leading-none">{title}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
            </div>
          </div>
          <Badge variant="secondary" className="h-5 text-xs">
            {count}
          </Badge>
        </header>
        <div className="space-y-2">{children}</div>
      </section>
    );
  },
);
