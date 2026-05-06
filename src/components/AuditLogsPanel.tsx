import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import PeriodFilter, { defaultPeriod, type PeriodValue } from "@/components/PeriodFilter";

type AuditLog = {
  id: string;
  occurred_at: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: unknown;
  new_data: unknown;
  changed_fields: string[] | null;
};

const TABLE_LABELS: Record<string, string> = {
  clients: "Clientes",
  contacts: "Contatos",
  sales: "Vendas",
  routine_tasks: "Rotinas",
  profiles: "Perfis",
  clinic_appointments: "Agenda Clínica",
  clinic_doctors: "Doutores",
  daily_priorities: "Prioridades",
  manager_daily_plans: "Planos diários",
  team_feedbacks: "Feedbacks",
  client_tasks: "Tarefas de cliente",
  client_task_items: "Itens de tarefa",
  kanban_stages: "Etapas Kanban",
  monthly_goals: "Metas mensais",
  sector_monthly_metrics: "Métricas setor",
  clinic_daily_tasks: "Tarefas clínica",
  time_clock_correction_requests: "Correções ponto",
};

const ACTION_LABEL: Record<string, string> = {
  INSERT: "Criado",
  UPDATE: "Editado",
  DELETE: "Excluído",
};

const ACTION_COLOR: Record<string, string> = {
  INSERT: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  UPDATE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
};

const PAGE_SIZE = 50;

export default function AuditLogsPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod("week"));
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const fromIso = new Date(`${period.from}T00:00:00-03:00`).toISOString();
    const toIso = new Date(`${period.to}T23:59:59-03:00`).toISOString();
    const { data } = await supabase
      .from("audit_logs")
      .select("*")
      .gte("occurred_at", fromIso)
      .lte("occurred_at", toIso)
      .order("occurred_at", { ascending: false })
      .limit(5000);
    setLogs((data ?? []) as AuditLog[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("audit-logs-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.from, period.to]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("audit-logs-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const users = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of logs) {
      if (l.user_id) map.set(l.user_id, l.user_name || l.user_email || "—");
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [logs]);

  const tables = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.table_name);
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (tableFilter !== "all" && l.table_name !== tableFilter) return false;
      if (userFilter !== "all" && l.user_id !== userFilter) return false;
      if (q) {
        const hay = [
          l.user_name,
          l.user_email,
          l.table_name,
          l.record_id,
          (l.changed_fields ?? []).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, actionFilter, tableFilter, userFilter]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return (
    <Card className="p-6 bg-card border-border/50">
      <div className="flex items-center gap-2 mb-1">
        <History className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">Histórico de movimentações</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Toda criação, edição e exclusão feita no sistema fica registrada aqui — apenas
        administradores visualizam.
      </p>

      <div className="mb-3">
        <PeriodFilter value={period} onChange={(v) => { setPeriod(v); setPage(0); }} />
      </div>

      <div className="grid md:grid-cols-4 gap-2 mb-4">

        <Input
          placeholder="Buscar por usuário, tabela, campo…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setActionFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            <SelectItem value="INSERT">Criados</SelectItem>
            <SelectItem value="UPDATE">Editados</SelectItem>
            <SelectItem value="DELETE">Excluídos</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={tableFilter}
          onValueChange={(v) => {
            setTableFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Área" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {tables.map((t) => (
              <SelectItem key={t} value={t}>
                {TABLE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={userFilter}
          onValueChange={(v) => {
            setUserFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Usuário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os usuários</SelectItem>
            {users.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Data/hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Campos alterados</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!loading && paginated.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Nenhum registro encontrado.
                </TableCell>
              </TableRow>
            )}
            {paginated.map((l) => (
              <>
                <TableRow key={l.id} className="cursor-pointer" onClick={() => toggle(l.id)}>
                  <TableCell className="text-xs tabular-nums">{fmtDate(l.occurred_at)}</TableCell>
                  <TableCell className="text-sm">
                    {l.user_name || l.user_email || (
                      <span className="text-muted-foreground italic">sistema</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {TABLE_LABELS[l.table_name] ?? l.table_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px]", ACTION_COLOR[l.action])}>
                      {ACTION_LABEL[l.action]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                    {l.changed_fields?.length
                      ? l.changed_fields.join(", ")
                      : l.action === "INSERT"
                        ? "novo registro"
                        : l.action === "DELETE"
                          ? "registro removido"
                          : "—"}
                  </TableCell>
                  <TableCell>
                    {expanded.has(l.id) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
                {expanded.has(l.id) && (
                  <TableRow key={l.id + "-d"}>
                    <TableCell colSpan={6} className="bg-secondary/30">
                      <div className="grid md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="font-semibold text-muted-foreground mb-1">Antes</div>
                          <pre className="p-2 rounded bg-background/60 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                            {l.old_data ? JSON.stringify(l.old_data, null, 2) : "—"}
                          </pre>
                        </div>
                        <div>
                          <div className="font-semibold text-muted-foreground mb-1">Depois</div>
                          <pre className="p-2 rounded bg-background/60 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                            {l.new_data ? JSON.stringify(l.new_data, null, 2) : "—"}
                          </pre>
                        </div>
                        {l.record_id && (
                          <div className="md:col-span-2 text-muted-foreground">
                            ID do registro: <span className="font-mono">{l.record_id}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>
          {filtered.length} registro(s) — página {page + 1}/{totalPages}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </Card>
  );
}
