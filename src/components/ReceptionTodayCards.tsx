import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CalendarDays, Search } from "lucide-react";
import { spToday } from "@/lib/spTime";
import ReceptionTaskCard from "@/components/ReceptionTaskCard";
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

type Props = {
  clients: Client[];
  profiles: Profile[];
  taskItemsByClient: Map<string, ClientTaskItem[]>;
  onOpenClient: (client: Client) => void;
};

/**
 * Grid de cards de paciente — cada card lista TODAS as tarefas de hoje
 * daquele paciente (D-7..D-1 / aniversário) com checkbox individual.
 */
export default function ReceptionTodayCards({
  clients,
  profiles,
  taskItemsByClient,
  onOpenClient,
}: Props) {
  const [search, setSearch] = useState("");

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const today = spToday();

  /** Por paciente: somente itens de hoje. */
  const cards = useMemo(() => {
    const list: { client: Client; items: ClientTaskItem[] }[] = [];
    for (const client of clients) {
      const all = taskItemsByClient.get(client.id) ?? [];
      const todayItems = all
        .filter((i) => i.task_date === today)
        .sort((a, b) => a.sort_order - b.sort_order);
      if (todayItems.length === 0) continue;
      if (search && !client.name.toLowerCase().includes(search.toLowerCase())) continue;
      list.push({ client, items: todayItems });
    }
    // Ordenação: cards com pendentes primeiro, depois pelo nome
    list.sort((a, b) => {
      const ap = a.items.some((i) => i.status === "pending") ? 0 : 1;
      const bp = b.items.some((i) => i.status === "pending") ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.client.name.localeCompare(b.client.name);
    });
    return list;
  }, [clients, taskItemsByClient, today, search]);

  const totalItems = cards.reduce((s, c) => s + c.items.length, 0);
  const doneItems = cards.reduce(
    (s, c) => s + c.items.filter((i) => i.status === "done").length,
    0,
  );
  const pendingItems = totalItems - doneItems;

  if (clients.length === 0 || (cards.length === 0 && !search)) {
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
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">Tarefas de hoje</h2>
            <p className="text-xs text-muted-foreground">
              {cards.length} {cards.length === 1 ? "paciente" : "pacientes"} · {pendingItems} pendentes · {doneItems} feitas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar paciente..."
                className="pl-7 h-8 w-52 text-xs"
              />
            </div>
            <Badge variant="secondary" className="text-xs">
              {pendingItems} pendentes
            </Badge>
            <Badge className="text-xs bg-success/20 text-success hover:bg-success/30">
              {doneItems} feitas
            </Badge>
          </div>
        </div>

        {cards.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            Nenhum paciente encontrado para “{search}”.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cards.map(({ client, items }) => (
              <ReceptionTaskCard
                key={client.id}
                client={client}
                items={items}
                responsibleName={
                  client.assigned_to
                    ? profileById.get(client.assigned_to)?.display_name || "Sem responsável"
                    : "— Sem responsável —"
                }
                onClick={() => onOpenClient(client)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
