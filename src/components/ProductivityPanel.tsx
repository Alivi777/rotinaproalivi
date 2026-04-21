import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trophy, Clock, CheckCircle2, AlertTriangle, User } from "lucide-react";

type Item = {
  id: string;
  client_id: string;
  task_type: string;
  task_label: string;
  task_date: string;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
};

type Profile = { user_id: string; display_name: string | null };

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekStartKey(): string {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Painel de produtividade: tarefas concluídas e pendentes por colaborador.
 * Usado tanto no /dashboard (compact) quanto na aba Produtividade em /clientes.
 */
export default function ProductivityPanel({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [range, setRange] = useState<"today" | "week">("today");

  async function load() {
    const start = range === "today" ? todayKey() : weekStartKey();
    const [it, pr] = await Promise.all([
      supabase
        .from("client_task_items")
        .select("id, client_id, task_type, task_label, task_date, status, completed_at, completed_by")
        .gte("task_date", start),
      supabase.from("profiles").select("user_id, display_name").eq("is_active", true),
    ]);
    if (it.data) setItems(it.data as Item[]);
    if (pr.data) setProfiles(pr.data as Profile[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("prod-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_task_items" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.user_id, p])),
    [profiles],
  );

  // Agregação por usuário (assignee = via card; aqui usamos completed_by para feitos
  // e fallback para "sem responsável" nos pendentes).
  type Agg = {
    user_id: string | null;
    name: string;
    done: number;
    pending: number;
    overdue: number;
  };
  const today = todayKey();
  const aggByUser = useMemo(() => {
    const m = new Map<string | null, Agg>();
    for (const it of items) {
      const isDone = it.status === "done";
      const uid = isDone ? it.completed_by : null; // pendentes sem responsável agregam separado
      const key = uid;
      let a = m.get(key);
      if (!a) {
        a = {
          user_id: uid,
          name: uid ? profileById.get(uid)?.display_name || "Sem nome" : "— Sem responsável —",
          done: 0,
          pending: 0,
          overdue: 0,
        };
        m.set(key, a);
      }
      if (isDone) a.done += 1;
      else {
        a.pending += 1;
        if (it.task_date < today) a.overdue += 1;
      }
    }
    return Array.from(m.values()).sort((a, b) => b.done - a.done);
  }, [items, profileById, today]);

  const totalDone = items.filter((i) => i.status === "done").length;
  const totalPending = items.filter((i) => i.status !== "done").length;
  const totalOverdue = items.filter((i) => i.status !== "done" && i.task_date < today).length;

  return (
    <Card className="p-5 bg-gradient-card border-border/50">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            {compact ? "Tarefas por colaborador" : "Produtividade — tarefas por colaborador"}
          </h3>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as "today" | "week")}>
          <TabsList className="h-7">
            <TabsTrigger value="today" className="h-6 text-xs px-2">Hoje</TabsTrigger>
            <TabsTrigger value="week" className="h-6 text-xs px-2">Semana</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} label="Feitas" value={totalDone} />
        <Stat icon={<Clock className="h-3.5 w-3.5 text-primary" />} label="Pendentes" value={totalPending} />
        <Stat icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive" />} label="Atrasadas" value={totalOverdue} />
      </div>

      <div className="space-y-2">
        {aggByUser.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma tarefa no período.
          </p>
        )}
        {aggByUser.map((a) => {
          const total = a.done + a.pending;
          const pct = total > 0 ? Math.round((a.done / total) * 100) : 0;
          return (
            <div
              key={a.user_id ?? "none"}
              className="flex items-center gap-3 p-2 rounded-lg bg-secondary/40 border border-border/30"
            >
              <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <User className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{a.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {a.done}/{total} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 mt-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-gradient-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-0.5 items-end shrink-0">
                <Badge variant="default" className="h-4 text-[10px] px-1.5 bg-success/20 text-success hover:bg-success/30">
                  {a.done} ✓
                </Badge>
                {a.overdue > 0 && (
                  <Badge variant="destructive" className="h-4 text-[10px] px-1.5">
                    {a.overdue} atrasadas
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
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
