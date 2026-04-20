import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PriorityAlert from "@/components/PriorityAlert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/lib/useIsAdmin";
import PrioritiesAdminPanel from "@/components/PrioritiesAdminPanel";
import { Crosshair, History } from "lucide-react";
import { cn } from "@/lib/utils";

type HistoryItem = {
  id: string;
  priority_date: string;
  mission_main: string;
  secondary_1: string | null;
  secondary_2: string | null;
  status: string;
};

export default function PrioritiesPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("daily_priorities")
      .select("id, priority_date, mission_main, secondary_1, secondary_2, status")
      .eq("user_id", user.id)
      .order("priority_date", { ascending: false })
      .limit(14)
      .then(({ data }) => setHistory((data as HistoryItem[]) ?? []));
  }, [user?.id]);

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
        <div className="flex items-center gap-2 mb-4">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Histórico (14 dias)</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem prioridades registradas ainda.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {history.map((h) => (
              <li key={h.id} className="py-3 flex items-start gap-3">
                <div className="text-xs uppercase tracking-widest text-muted-foreground w-24 shrink-0 pt-0.5">
                  {new Date(h.priority_date + "T00:00:00").toLocaleDateString(
                    "pt-BR",
                    { day: "2-digit", month: "short" }
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{h.mission_main}</div>
                  {(h.secondary_1 || h.secondary_2) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[h.secondary_1, h.secondary_2].filter(Boolean).join(" · ")}
                    </div>
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
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
