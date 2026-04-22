import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
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

  // ---- Mapeia pacientes com tarefas de HOJE ----
  const cardsToday = useMemo(() => {
    const list: { client: Client; items: ClientTaskItem[]; allDone: boolean }[] = [];
    for (const client of clients) {
      const all = taskItemsByClient.get(client.id) ?? [];
      const todayItems = all
        .filter((i) => i.task_date === today)
        .sort((a, b) => a.sort_order - b.sort_order);
      if (todayItems.length === 0) continue;
      if (search && !client.name.toLowerCase().includes(search.toLowerCase())) continue;
      if (doctorFilter) {
        const d = doctorByClient.get(client.id);
        if (!d || d.name !== doctorFilter) continue;
      }
      const allDone = todayItems.every((i) => i.status === "done");
      list.push({ client, items: todayItems, allDone });
    }
    list.sort((a, b) => a.client.name.localeCompare(b.client.name));
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

  // ---- Drag handlers ----
  function onDragStart(e: React.DragEvent, clientId: string) {
    e.dataTransfer.setData("text/plain", clientId);
    e.dataTransfer.effectAllowed = "move";
  }

  async function onDropCol(e: React.DragEvent, target: ColumnKey) {
    e.preventDefault();
    setOverCol(null);
    const clientId = e.dataTransfer.getData("text/plain");
    if (!clientId) return;
    const items = taskItemsByClient.get(clientId) ?? [];
    const todayItems = items.filter((i) => i.task_date === today);
    if (todayItems.length === 0) return;

    if (target === "concluidos") {
      const next = todayItems.find((i) => i.status === "pending");
      if (!next) return; // já tudo feito
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("client_task_items")
        .update({
          status: "done",
          completed_at: now,
          completed_by: user?.id ?? null,
        })
        .eq("id", next.id);
      if (error) return toast.error(error.message);
      if (next.daily_task_id) {
        await supabase
          .from("clinic_daily_tasks")
          .update({
            status: "done",
            completed_at: now,
            completed_by: user?.id ?? null,
          })
          .eq("id", next.daily_task_id);
      }
      toast.success(`Tarefa "${next.task_label}" concluída`);
    } else if (target === "programadas") {
      // Reabrir a última concluída
      const lastDone = [...todayItems].reverse().find((i) => i.status === "done");
      if (!lastDone) return;
      const { error } = await supabase
        .from("client_task_items")
        .update({ status: "pending", completed_at: null, completed_by: null })
        .eq("id", lastDone.id);
      if (error) return toast.error(error.message);
      if (lastDone.daily_task_id) {
        await supabase
          .from("clinic_daily_tasks")
          .update({ status: "pending", completed_at: null, completed_by: null })
          .eq("id", lastDone.daily_task_id);
      }
      toast.message(`Tarefa "${lastDone.task_label}" reaberta`);
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* COL 1 — Novo Atendimento */}
        <FunnelColumn
          title="Novo Atendimento"
          subtitle="WhatsApp aguardando — atenda agora"
          icon={<AlertOctagon className="h-4 w-4 text-destructive" />}
          accent="destructive"
          count={novosFiltrados.length}
          onDragOver={(e) => onDragOverCol(e, "novo")}
          onDragLeave={() => setOverCol(null)}
          onDrop={(e) => {
            e.preventDefault();
            setOverCol(null);
          }}
          highlight={overCol === "novo"}
        >
          {novosFiltrados.length === 0 ? (
            <EmptyHint text="Sem novos atendimentos." />
          ) : (
            novosFiltrados.map((att) => (
              <Card
                key={att.id}
                className="p-3 border-destructive/40 bg-destructive/5 ring-1 ring-destructive/30 animate-pulse-slow"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Badge
                    variant="destructive"
                    className="h-5 text-[10px] uppercase tracking-wider"
                  >
                    Atenda agora
                  </Badge>
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {minutesAgo(att.last_message_at)} min
                  </span>
                </div>
                <div className="font-medium text-sm truncate">
                  {att.from_name || "Contato sem nome"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {att.from_phone}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => attendNow(att)}
                  >
                    <MessageSquareText className="h-3 w-3 mr-1" />
                    Atender
                  </Button>
                </div>
              </Card>
            ))
          )}
        </FunnelColumn>

        {/* COL 2 — Programadas (tarefas de hoje) */}
        <FunnelColumn
          title="Programadas para hoje"
          subtitle="Tarefas da Agenda Clínica do dia"
          icon={<CalendarClock className="h-4 w-4 text-primary" />}
          accent="primary"
          count={programadas.length}
          onDragOver={(e) => onDragOverCol(e, "programadas")}
          onDragLeave={() => setOverCol(null)}
          onDrop={(e) => onDropCol(e, "programadas")}
          highlight={overCol === "programadas"}
        >
          {programadas.length === 0 ? (
            <EmptyHint text={search ? `Nada para "${search}".` : "Sem programadas hoje."} />
          ) : (
            programadas.map(({ client, items }) => (
              <div
                key={client.id}
                draggable
                onDragStart={(e) => onDragStart(e, client.id)}
                className="cursor-grab active:cursor-grabbing"
              >
                <ReceptionTaskCard
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
              </div>
            ))
          )}
        </FunnelColumn>

        {/* COL 3 — Concluídos */}
        <FunnelColumn
          title="Concluídos"
          subtitle="Todas as tarefas do dia feitas"
          icon={<CheckCircle2 className="h-4 w-4 text-success" />}
          accent="success"
          count={concluidos.length}
          onDragOver={(e) => onDragOverCol(e, "concluidos")}
          onDragLeave={() => setOverCol(null)}
          onDrop={(e) => onDropCol(e, "concluidos")}
          highlight={overCol === "concluidos"}
        >
          {concluidos.length === 0 ? (
            <EmptyHint text="Arraste cards prontos para cá." />
          ) : (
            concluidos.map(({ client, items }) => (
              <div
                key={client.id}
                draggable
                onDragStart={(e) => onDragStart(e, client.id)}
                className="cursor-grab active:cursor-grabbing"
              >
                <ReceptionTaskCard
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
              </div>
            ))
          )}
        </FunnelColumn>
      </div>

      {totalToday === 0 && pending.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma tarefa para hoje. Use “Sincronizar agendas da semana”.
        </Card>
      )}
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
