import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PriorityAlert from "@/components/PriorityAlert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/lib/useIsAdmin";
import PrioritiesAdminPanel from "@/components/PrioritiesAdminPanel";
import { Crosshair, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type HistoryItem = {
  id: string;
  user_id: string;
  priority_date: string;
  mission_main: string;
  secondary_1: string | null;
  secondary_2: string | null;
  status: string;
  mission_main_done: boolean;
  secondary_1_done: boolean;
  secondary_2_done: boolean;
};

type Profile = { user_id: string; display_name: string | null };

export default function PrioritiesPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filterUser, setFilterUser] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );

  async function load() {
    if (!user) return;
    let q = supabase
      .from("daily_priorities")
      .select(
        "id, user_id, priority_date, mission_main, secondary_1, secondary_2, status, mission_main_done, secondary_1_done, secondary_2_done"
      )
      .gte("priority_date", fromDate)
      .lte("priority_date", toDate)
      .order("priority_date", { ascending: false });

    if (!isAdmin) {
      q = q.eq("user_id", user.id);
    } else if (filterUser !== "all") {
      q = q.eq("user_id", filterUser);
    }
    const { data } = await q;
    setHistory((data as HistoryItem[]) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin, filterUser, fromDate, toDate]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("is_active", true)
      .order("display_name")
      .then(({ data }) => setProfiles((data as Profile[]) ?? []));
  }, [isAdmin]);

  const nameOf = useMemo(
    () => (uid: string) =>
      profiles.find((p) => p.user_id === uid)?.display_name || "—",
    [profiles]
  );

  async function toggleDone(
    item: HistoryItem,
    field: "mission_main_done" | "secondary_1_done" | "secondary_2_done",
    checked: boolean
  ) {
    const nowIso = checked ? new Date().toISOString() : null;
    const patch =
      field === "mission_main_done"
        ? { mission_main_done: checked, mission_main_done_at: nowIso }
        : field === "secondary_1_done"
        ? { secondary_1_done: checked, secondary_1_done_at: nowIso }
        : { secondary_2_done: checked, secondary_2_done_at: nowIso };
    const { error } = await supabase
      .from("daily_priorities")
      .update(patch)
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <AppShell>
      <header className="mb-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <Crosshair className="h-3.5 w-3.5" />
          Método tático · Definição do dia
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
          Prioridades
        </h1>
        <p className="text-muted-foreground mt-1">
          Missão principal + 2 secundárias delegadas pelo gestor todos os dias.
        </p>
      </header>

      <PriorityAlert />

      {isAdmin && (
        <div className="mb-6">
          <PrioritiesAdminPanel />
        </div>
      )}

      <Card className="p-6 bg-card border-border/50">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">
              {isAdmin ? "Histórico geral" : "Meu histórico"}
            </h2>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                De
              </label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 w-36"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Até
              </label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 w-36"
              />
            </div>
            {isAdmin && (
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Colaborador
                </label>
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="h-8 w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.display_name || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem prioridades no período selecionado.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {history.map((h) => {
              const canCheck = h.user_id === user?.id || isAdmin;
              return (
                <li key={h.id} className="py-3 flex items-start gap-3">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground w-24 shrink-0 pt-0.5">
                    {new Date(h.priority_date + "T00:00:00").toLocaleDateString(
                      "pt-BR",
                      { day: "2-digit", month: "short" }
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    {isAdmin && (
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {nameOf(h.user_id)}
                      </div>
                    )}
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={h.mission_main_done}
                        disabled={!canCheck}
                        onCheckedChange={(v) =>
                          toggleDone(h, "mission_main_done", !!v)
                        }
                      />
                      <span
                        className={cn(
                          "font-medium text-sm",
                          h.mission_main_done &&
                            "line-through text-muted-foreground"
                        )}
                      >
                        {h.mission_main}
                      </span>
                    </label>
                    {h.secondary_1 && (
                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={h.secondary_1_done}
                          disabled={!canCheck}
                          onCheckedChange={(v) =>
                            toggleDone(h, "secondary_1_done", !!v)
                          }
                        />
                        <span
                          className={cn(
                            "text-xs",
                            h.secondary_1_done
                              ? "line-through text-muted-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {h.secondary_1}
                        </span>
                      </label>
                    )}
                    {h.secondary_2 && (
                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={h.secondary_2_done}
                          disabled={!canCheck}
                          onCheckedChange={(v) =>
                            toggleDone(h, "secondary_2_done", !!v)
                          }
                        />
                        <span
                          className={cn(
                            "text-xs",
                            h.secondary_2_done
                              ? "line-through text-muted-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {h.secondary_2}
                        </span>
                      </label>
                    )}
                  </div>
                  <Badge
                    variant={
                      h.status === "acknowledged"
                        ? "default"
                        : h.status === "questioned"
                        ? "secondary"
                        : "destructive"
                    }
                    className={cn("uppercase text-[10px] tracking-wide")}
                  >
                    {h.status === "acknowledged" && "Aceita"}
                    {h.status === "questioned" && "Questionada"}
                    {h.status === "pending" && "Pendente"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
