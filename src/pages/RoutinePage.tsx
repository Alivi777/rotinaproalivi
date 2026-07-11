import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useProfile, useSectors } from "@/lib/useProfile";
import { Plus, Trash2, TrendingUp, Calendar, Users2, UserCheck, ExternalLink, GripVertical, Loader2 } from "lucide-react";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PriorityAlert from "@/components/PriorityAlert";
import MyAssignmentCard from "@/components/MyAssignmentCard";
import SectorResultsPanel from "@/components/SectorResultsPanel";
import { Link } from "react-router-dom";

type Task = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  sector_id: string | null;
};
type Completion = { id: string; task_id: string; user_id: string };
type Profile = { user_id: string; display_name: string | null; sector_id: string | null };
type ClientTask = {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  due_date: string;
  completed_at: string | null;
  clients?: { name: string } | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function RoutinePage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { sectors } = useSectors();
  const { isAdmin } = useIsAdmin();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSectorId, setNewSectorId] = useState<string>("");
  const [activeSectorId, setActiveSectorId] = useState<string>("");
  const [clientTasks, setClientTasks] = useState<ClientTask[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isOrderSavePending, setIsOrderSavePending] = useState(false);

  const lastStableTasksRef = useRef<Task[]>([]);
  const rollbackTasksRef = useRef<Task[] | null>(null);
  const optimisticTasksRef = useRef<Task[]>([]);
  const pendingOrderRef = useRef<Task[] | null>(null);
  const saveOrderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function persistPendingOrder() {
    const pendingOrder = pendingOrderRef.current;
    if (!pendingOrder || pendingOrder.length === 0) {
      setIsOrderSavePending(false);
      return;
    }

    const stable = lastStableTasksRef.current;
    const stableById = new Map(stable.map((t) => [t.id, t.sort_order]));
    const changed = pendingOrder.filter((t) => stableById.get(t.id) !== t.sort_order);

    setIsOrderSavePending(false);

    if (changed.length === 0) {
      pendingOrderRef.current = null;
      rollbackTasksRef.current = null;
      return;
    }

    setIsSavingOrder(true);
    const optimisticSnapshot = optimisticTasksRef.current;

    try {
      const results = await Promise.all(
        changed.map((t) =>
          supabase.from("routine_tasks").update({ sort_order: t.sort_order }).eq("id", t.id),
        ),
      );
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;

      lastStableTasksRef.current = optimisticSnapshot;
      rollbackTasksRef.current = null;
      pendingOrderRef.current = null;
      toast.success("Ordem salva", {
        description: "A nova ordem das tarefas foi atualizada com sucesso.",
      });
    } catch (e) {
      if (rollbackTasksRef.current) {
        setTasks(rollbackTasksRef.current);
        optimisticTasksRef.current = rollbackTasksRef.current;
      }
      rollbackTasksRef.current = null;
      pendingOrderRef.current = null;
      toast.error("Erro ao salvar ordem", {
        description: "A nova ordem não foi salva. A lista foi restaurada para a ordem anterior.",
      });
      await load();
    } finally {
      setIsSavingOrder(false);
    }
  }

  async function reorderTasks(draggedId: string, targetId: string) {
    if (!isAdmin || isSavingOrder || draggedId === targetId) return;
    const fromIdx = visibleTasks.findIndex((t) => t.id === draggedId);
    const toIdx = visibleTasks.findIndex((t) => t.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = visibleTasks.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const withOrder = next.map((t, i) => ({ ...t, sort_order: i + 1 }));
    const withOrderById = new Map(withOrder.map((t) => [t.id, t.sort_order]));

    const nextTasks = tasks.map((t) => {
      const so = withOrderById.get(t.id);
      return so !== undefined ? { ...t, sort_order: so } : t;
    });

    if (!rollbackTasksRef.current) {
      rollbackTasksRef.current = lastStableTasksRef.current.length
        ? lastStableTasksRef.current
        : tasks;
    }

    optimisticTasksRef.current = nextTasks;
    setTasks(nextTasks);

    pendingOrderRef.current = nextTasks;
    setIsOrderSavePending(true);

    if (saveOrderTimeoutRef.current) {
      clearTimeout(saveOrderTimeoutRef.current);
    }
    saveOrderTimeoutRef.current = setTimeout(() => {
      saveOrderTimeoutRef.current = null;
      void persistPendingOrder();
    }, 700);
  }

  useEffect(() => {
    return () => {
      if (saveOrderTimeoutRef.current) {
        clearTimeout(saveOrderTimeoutRef.current);
      }
    };
  }, []);


  const today = todayStr();

  // Default tab to user's sector once known
  useEffect(() => {
    if (profile?.sector_id && !activeSectorId) {
      setActiveSectorId(profile.sector_id);
      setNewSectorId(profile.sector_id);
    }
  }, [profile, activeSectorId]);

  async function load() {
    const [t, c, p, ct] = await Promise.all([
      supabase.from("routine_tasks").select("*").eq("active", true).order("sort_order"),
      supabase.from("task_completions").select("id, task_id, user_id").eq("completion_date", today),
      supabase.from("profiles").select("user_id, display_name, sector_id"),
      user
        ? supabase
            .from("client_tasks")
            .select("id, client_id, title, description, due_date, completed_at, clients(name)")
            .eq("assigned_to", user.id)
            .lte("due_date", today)
            .order("due_date", { ascending: true })
        : Promise.resolve({ data: [] as ClientTask[] }),
    ]);
    if (t.data) {
      const loaded = t.data as Task[];
      setTasks(loaded);
      if (!isSavingOrder && !pendingOrderRef.current) {
        lastStableTasksRef.current = loaded;
        optimisticTasksRef.current = loaded;
      }
    }
    if (c.data) setCompletions(c.data as Completion[]);
    if (p.data) setProfiles(p.data as Profile[]);
    if (ct.data) setClientTasks(ct.data as unknown as ClientTask[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("routine-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_completions" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_tasks" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "routine_tasks" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const myCompletions = useMemo(
    () => new Set(completions.filter((c) => c.user_id === user?.id).map((c) => c.task_id)),
    [completions, user]
  );

  const visibleTasks = useMemo(
    () => (activeSectorId ? tasks.filter((t) => t.sector_id === activeSectorId) : tasks),
    [tasks, activeSectorId]
  );

  async function toggle(taskId: string) {
    if (!user) return;
    const isDone = myCompletions.has(taskId);
    if (isDone) {
      const { error } = await supabase
        .from("task_completions")
        .delete()
        .eq("task_id", taskId)
        .eq("user_id", user.id)
        .eq("completion_date", today);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("task_completions").insert({
        task_id: taskId,
        user_id: user.id,
        completion_date: today,
      });
      if (error) toast.error(error.message);
    }
  }

  async function toggleClientTask(t: ClientTask) {
    if (!user) return;
    const { error } = await supabase
      .from("client_tasks")
      .update({
        completed_at: t.completed_at ? null : new Date().toISOString(),
        completed_by: t.completed_at ? null : user.id,
      })
      .eq("id", t.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function addTask() {
    if (!newTitle.trim()) return;
    const sectorId = newSectorId || activeSectorId || profile?.sector_id || null;
    const sectorTasks = tasks.filter((t) => t.sector_id === sectorId);
    const order = sectorTasks.length
      ? Math.max(...sectorTasks.map((t) => t.sort_order)) + 1
      : 1;
    const { error } = await supabase.from("routine_tasks").insert({
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      sort_order: order,
      sector_id: sectorId,
    });
    if (error) return toast.error(error.message);
    toast.success("Tarefa adicionada");
    setNewTitle("");
    setNewDesc("");
    setOpenNew(false);
    load();
  }

  async function removeTask(id: string) {
    const { error } = await supabase.from("routine_tasks").update({ active: false }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  // My sector progress only
  const mySectorTasks = tasks.filter((t) => t.sector_id === profile?.sector_id);
  const myDone = mySectorTasks.filter((t) => myCompletions.has(t.id)).length;
  const total = mySectorTasks.length;
  const pct = total ? Math.round((myDone / total) * 100) : 0;

  // Team progress: per user count within their own sector
  const teamProgress = profiles
    .filter((p) => p.sector_id)
    .map((p) => {
      const sectorTaskIds = tasks.filter((t) => t.sector_id === p.sector_id).map((t) => t.id);
      const count = completions.filter(
        (c) => c.user_id === p.user_id && sectorTaskIds.includes(c.task_id)
      ).length;
      const sectorName = sectors.find((s) => s.id === p.sector_id)?.name ?? "—";
      return { ...p, count, sectorTotal: sectorTaskIds.length, sectorName };
    })
    .sort((a, b) => b.count - a.count);

  const activeSector = sectors.find((s) => s.id === activeSectorId);

  return (
    <AppShell>
      <header className="mb-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <Calendar className="h-3.5 w-3.5" />
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Rotina diária</h1>
        <p className="text-muted-foreground mt-1">
          Marque cada tarefa conforme conclui. Reseta automaticamente todo dia.
        </p>
      </header>

      <PriorityAlert />
      <MyAssignmentCard />

      <div className="mb-6">
        <SectorResultsPanel
          defaultSectorId={profile?.sector_id}
          showSectorTabs
          title="Resultados esperados do setor — mês"
        />
      </div>

      {clientTasks.length > 0 && (
        <Card className="p-5 mb-6 bg-gradient-card border-primary/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">
                Tarefas de clientes para hoje
              </h2>
              <span className="text-xs text-muted-foreground">
                ({clientTasks.filter((t) => !t.completed_at).length} pendentes)
              </span>
            </div>
          </div>
          <ul className="divide-y divide-border/50">
            {clientTasks.map((t) => {
              const overdue = t.due_date < today && !t.completed_at;
              return (
                <li
                  key={t.id}
                  className={cn(
                    "py-3 flex items-start gap-3",
                    t.completed_at && "opacity-50"
                  )}
                >
                  <Checkbox
                    checked={!!t.completed_at}
                    onCheckedChange={() => toggleClientTask(t)}
                    className="mt-1 h-5 w-5"
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "font-medium text-sm",
                        t.completed_at && "line-through text-muted-foreground"
                      )}
                    >
                      {t.title}
                      <Link
                        to="/clientes"
                        className="ml-2 inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                      >
                        {t.clients?.name ?? "cliente"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t.description}
                      </div>
                    )}
                    <div
                      className={cn(
                        "text-xs mt-1",
                        overdue ? "text-destructive font-medium" : "text-muted-foreground"
                      )}
                    >
                      {overdue ? "⚠ Atrasada · " : ""}
                      {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <Card className="p-5 bg-gradient-card border-border/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Seu progresso ({sectors.find((s) => s.id === profile?.sector_id)?.name ?? "—"})
            </span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{pct}%</span>
            <span className="text-sm text-muted-foreground">
              {myDone}/{total} tarefas
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-gradient-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>

        <Card className="p-5 bg-gradient-card border-border/50 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Time hoje
            </span>
            <Users2 className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-2.5">
            {teamProgress.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum membro ainda.</p>
            )}
            {teamProgress.slice(0, 6).map((p) => {
              const ratio = p.sectorTotal ? (p.count / p.sectorTotal) * 100 : 0;
              return (
                <div key={p.user_id} className="flex items-center gap-3">
                  <div className="w-40 text-sm truncate">
                    {p.display_name || "Sem nome"}
                    {p.user_id === user?.id && (
                      <span className="ml-1 text-xs text-primary">(você)</span>
                    )}
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.sectorName}
                    </span>
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground w-16 text-right tabular-nums">
                    {p.count}/{p.sectorTotal}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="p-6 bg-card border-border/50">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              Checklist
              {isAdmin && (isOrderSavePending || isSavingOrder) && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  {isSavingOrder && <Loader2 className="h-3 w-3 animate-spin" />}
                  {isSavingOrder ? "Salvando ordem..." : "Alterações pendentes..."}
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              Sua marcação só conta para você. Cada membro tem sua própria visão.
            </p>
          </div>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Nova tarefa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar tarefa à rotina</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Setor</Label>
                  <Select value={newSectorId} onValueChange={setNewSectorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o setor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Título</Label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ex: Conferir caixa do dia"
                  />
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Detalhes ou critérios"
                  />
                </div>
                <Button onClick={addTask} className="w-full">
                  Adicionar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeSectorId} onValueChange={setActiveSectorId} className="mb-5">
          <TabsList className="flex flex-wrap h-auto bg-secondary/50">
            {sectors.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="text-xs">
                {s.name}
                {s.id === profile?.sector_id && (
                  <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : visibleTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Nenhuma tarefa cadastrada para {activeSector?.name ?? "este setor"}.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {visibleTasks.map((task) => {
              const done = myCompletions.has(task.id);
              const completedBy = completions
                .filter((c) => c.task_id === task.id)
                .map((c) => profiles.find((p) => p.user_id === c.user_id)?.display_name)
                .filter(Boolean);
              return (
                <li
                  key={task.id}
                  draggable={isAdmin}
                  onDragStart={(e) => {
                    if (!isAdmin) return;
                    setDraggingId(task.id);
                    e.dataTransfer.setData("text/plain", task.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (!isAdmin) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnter={() => {
                    if (!isAdmin) return;
                    setDragOverId(task.id);
                  }}
                  onDragLeave={(e) => {
                    if (!isAdmin) return;
                    if (dragOverId === task.id) {
                      const related = e.relatedTarget as Node | null;
                      if (!related || !(e.currentTarget as Node).contains(related)) {
                        setDragOverId((curr) => (curr === task.id ? null : curr));
                      }
                    }
                  }}
                  onDrop={(e) => {
                    if (!isAdmin) return;
                    e.preventDefault();
                    const draggedId = e.dataTransfer.getData("text/plain") || draggingId;
                    setDraggingId(null);
                    setDragOverId(null);
                    if (draggedId && draggedId !== task.id) {
                      void reorderTasks(draggedId, task.id);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  className={cn(
                    "py-4 flex items-start gap-4 group transition-smooth",
                    done && "opacity-60",
                    draggingId === task.id && "opacity-50",
                    dragOverId === task.id && isAdmin && draggingId !== task.id && "ring-2 ring-primary/30 rounded-md"
                  )}
                >
                  {isAdmin && (
                    <button
                      type="button"
                      aria-label="Arrastar para reordenar"
                      className="mt-1 -ml-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
                      onClick={(e) => e.preventDefault()}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  )}
                  <Checkbox
                    checked={done}
                    onCheckedChange={() => toggle(task.id)}
                    className="mt-1 h-5 w-5"
                  />

                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "font-medium transition-smooth",
                        done && "line-through text-muted-foreground"
                      )}
                    >
                      {task.title}
                    </div>
                    {task.description && (
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {task.description}
                      </div>
                    )}
                    {completedBy.length > 0 && (
                      <div className="text-xs text-primary mt-1.5">
                        ✓ {completedBy.join(", ")}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-smooth text-muted-foreground hover:text-destructive"
                    onClick={() => removeTask(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
