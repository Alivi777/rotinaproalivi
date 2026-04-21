import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, AlertTriangle, CheckCircle2, Clock, Phone, MessageCircle, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseClientNotesMeta, relativeDayLabel } from "@/lib/clientNotesMeta";
import { openWhatsappWeb } from "@/lib/whatsapp";
import { spToday, spDate } from "@/lib/spTime";
import TaskItemCheckDialog from "@/components/TaskItemCheckDialog";
import type { ClientTaskItem } from "@/lib/useClientTaskItems";
import { useAuth } from "@/lib/auth";

type Client = { id: string; name: string; phone: string | null; notes: string | null; assigned_to: string | null };
type Profile = { user_id: string; display_name: string | null };

/** HH:mm em SP a partir de ISO. */
function fmtTimeSP(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Extrai appointment_at da tag [appt:...] das notes do cliente. */
function extractApptIso(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/\[appt:([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

/**
 * Painel central no Dashboard: lista TODAS as tarefas dos colaboradores no formato
 * da página /rotina. Permite filtrar por colaborador e por período (hoje/semana).
 */
export default function CollaboratorTasksPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<ClientTaskItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [range, setRange] = useState<"today" | "pending" | "week">("today");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [checking, setChecking] = useState<{ item: ClientTaskItem; clientName: string } | null>(null);

  const today = todayKey();

  async function load() {
    const start =
      range === "week"
        ? (() => {
            const d = new Date();
            const dow = d.getDay();
            const diff = dow === 0 ? -6 : 1 - dow;
            d.setDate(d.getDate() + diff);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          })()
        : today;

    const [it, cl, pr] = await Promise.all([
      supabase
        .from("client_task_items")
        .select("*")
        .gte("task_date", range === "pending" ? "1900-01-01" : start)
        .lte("task_date", range === "today" ? today : "2999-12-31")
        .order("task_date", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase.from("clients").select("id, name, phone, notes, assigned_to"),
      supabase.from("profiles").select("user_id, display_name").eq("is_active", true),
    ]);

    if (it.data) {
      let arr = it.data as ClientTaskItem[];
      if (range === "pending") arr = arr.filter((x) => x.status !== "done");
      setItems(arr);
    }
    if (cl.data) setClients(cl.data as Client[]);
    if (pr.data) setProfiles(pr.data as Profile[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("collab-tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_task_items" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);

  // Agrupar por colaborador (responsável do cliente)
  type Row = { item: ClientTaskItem; client: Client };
  const byAssignee = useMemo(() => {
    const m = new Map<string | null, Row[]>();
    for (const it of items) {
      const c = clientById.get(it.client_id);
      if (!c) continue;
      const uid = c.assigned_to;
      if (!m.has(uid)) m.set(uid, []);
      m.get(uid)!.push({ item: it, client: c });
    }
    return Array.from(m.entries())
      .map(([uid, rows]) => ({
        uid,
        name: uid ? profileById.get(uid)?.display_name || "Sem nome" : "— Sem responsável —",
        rows: rows.sort((a, b) => {
          const ad = a.item.status === "done" ? 1 : 0;
          const bd = b.item.status === "done" ? 1 : 0;
          if (ad !== bd) return ad - bd;
          return a.client.name.localeCompare(b.client.name);
        }),
      }))
      .sort((a, b) => {
        // colocar "você" primeiro, depois ordem alfabética
        if (a.uid === user?.id) return -1;
        if (b.uid === user?.id) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [items, clientById, profileById, user]);

  const visibleGroups =
    assigneeFilter === "all"
      ? byAssignee
      : assigneeFilter === "me"
        ? byAssignee.filter((g) => g.uid === user?.id)
        : byAssignee.filter((g) => g.uid === assigneeFilter);

  const totalPending = items.filter((i) => i.status !== "done").length;
  const totalDone = items.filter((i) => i.status === "done").length;
  const totalOverdue = items.filter((i) => i.status !== "done" && i.task_date < today).length;

  return (
    <Card className="p-6 bg-gradient-card border-border/50">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-lg">Tarefas dos colaboradores</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <TabsList className="h-8">
              <TabsTrigger value="today" className="h-7 text-xs px-2.5">Hoje</TabsTrigger>
              <TabsTrigger value="pending" className="h-7 text-xs px-2.5">Pendentes</TabsTrigger>
              <TabsTrigger value="week" className="h-7 text-xs px-2.5">Semana</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os colaboradores</SelectItem>
              <SelectItem value="me">Só eu</SelectItem>
              {profiles
                .filter((p) => p.user_id !== user?.id)
                .map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.display_name || "Sem nome"}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <Stat icon={<Clock className="h-3.5 w-3.5 text-primary" />} label="Pendentes" value={totalPending} />
        <Stat icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} label="Feitas" value={totalDone} />
        <Stat icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive" />} label="Atrasadas" value={totalOverdue} />
      </div>

      {visibleGroups.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa no período.</p>
      )}

      <div className="space-y-6">
        {visibleGroups.map((g) => {
          const gPending = g.rows.filter((r) => r.item.status !== "done").length;
          const gDone = g.rows.length - gPending;
          return (
            <section key={g.uid ?? "none"}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="font-semibold text-sm">
                    {g.name}
                    {g.uid === user?.id && <span className="ml-1.5 text-xs text-primary">(você)</span>}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="h-5 text-[10px]">{gPending} pendentes</Badge>
                  <Badge className="h-5 text-[10px] bg-success/20 text-success hover:bg-success/30">{gDone} feitas</Badge>
                </div>
              </div>

              <ul className="divide-y divide-border/40 rounded-lg border border-border/40 bg-card/40">
                {g.rows.map(({ item, client }) => {
                  const isDone = item.status === "done";
                  const overdue = !isDone && item.task_date < today;
                  const meta = parseClientNotesMeta(client.notes);
                  return (
                    <li
                      key={item.id}
                      className={cn("py-3 px-3 flex items-start gap-3", isDone && "opacity-60")}
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
                          <span className={cn("font-medium text-sm", isDone && "line-through text-muted-foreground")}>
                            {item.task_label}
                          </span>
                          {overdue && (
                            <Badge variant="destructive" className="h-4 text-[10px] px-1.5 gap-1">
                              <AlertTriangle className="h-2.5 w-2.5" /> Atrasada
                            </Badge>
                          )}
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
                        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="font-medium text-foreground/80">{client.name}</span>
                          {client.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {client.phone}
                            </span>
                          )}
                          <span className="text-[10px] uppercase tracking-wider">
                            {item.task_date}
                          </span>
                        </div>
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
            </section>
          );
        })}
      </div>

      <TaskItemCheckDialog
        open={!!checking}
        onOpenChange={(v) => !v && setChecking(null)}
        item={checking?.item ?? null}
        clientName={checking?.clientName ?? ""}
      />
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary/30 border border-border/30 p-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
