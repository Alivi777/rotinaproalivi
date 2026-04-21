import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Phone, Stethoscope, User, MessageCircle, ChevronRight } from "lucide-react";
import { parseClientNotesMeta, relativeDayLabel, stripMetaTags } from "@/lib/clientNotesMeta";
import { openWhatsappWeb } from "@/lib/whatsapp";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  stage_id: string | null;
  assigned_to: string | null;
  sector_id: string | null;
};

type Stage = { id: string; name: string; color: string | null };
type Profile = { user_id: string; display_name: string | null };

type Props = {
  clients: Client[];
  stages: Stage[];
  profiles: Profile[];
  onOpenClient: (c: Client) => void;
};

export default function TasksByDayView({ clients, stages, profiles, onOpenClient }: Props) {
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.user_id, p])),
    [profiles],
  );

  // Apenas cards que vieram da Agenda (têm tag [task_date:...])
  const enriched = useMemo(
    () =>
      clients
        .map((c) => ({ c, meta: parseClientNotesMeta(c.notes) }))
        .filter((x) => !!x.meta.taskDate),
    [clients],
  );

  // Agrupar por dia
  const byDay = useMemo(() => {
    const m = new Map<string, typeof enriched>();
    for (const item of enriched) {
      const d = item.meta.taskDate!;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(item);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [enriched]);

  // Soma por responsável (tudo da semana)
  const totalByAssignee = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const { c } of enriched) {
      m.set(c.assigned_to, (m.get(c.assigned_to) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [enriched]);

  if (enriched.length === 0) {
    return (
      <Card className="p-12 text-center bg-gradient-card border-border/50">
        <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">
          Nenhuma tarefa da agenda na semana. Use “Sincronizar tarefas da semana”.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo por responsável */}
      <Card className="p-5 bg-gradient-card border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Tarefas da semana por responsável
          </h3>
          <Badge variant="secondary" className="ml-auto">
            {enriched.length} no total
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {totalByAssignee.map(([uid, count]) => {
            const name = uid
              ? profileById.get(uid)?.display_name || "Sem nome"
              : "— Sem responsável (vincule o doutor) —";
            return (
              <div
                key={uid ?? "none"}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/60 border border-border/50"
              >
                <span className="text-sm font-medium">{name}</span>
                <Badge variant="outline" className="h-5 text-xs tabular-nums">
                  {count}
                </Badge>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Lista por dia */}
      {byDay.map(([date, items]) => {
        // soma por responsável do dia
        const dayByAssignee = new Map<string | null, number>();
        for (const { c } of items) {
          dayByAssignee.set(c.assigned_to, (dayByAssignee.get(c.assigned_to) ?? 0) + 1);
        }
        const dayAssignees = Array.from(dayByAssignee.entries()).sort(
          (a, b) => b[1] - a[1],
        );

        return (
          <section key={date}>
            <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-baseline gap-3">
                <h2 className="text-xl font-bold tracking-tight">
                  {relativeDayLabel(date)}
                </h2>
                <Badge variant="secondary" className="text-xs">
                  {items.length} tarefa{items.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {dayAssignees.map(([uid, count]) => {
                  const name = uid
                    ? profileById.get(uid)?.display_name || "Sem nome"
                    : "Sem responsável";
                  return (
                    <span
                      key={uid ?? "none"}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/40 border border-border/40"
                    >
                      {name}: <strong className="tabular-nums">{count}</strong>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-3">
              {items.map(({ c, meta }) => {
                const stage = c.stage_id ? stageById.get(c.stage_id) : undefined;
                const responsibleName = c.assigned_to
                  ? profileById.get(c.assigned_to)?.display_name || "Sem nome"
                  : "— Sem responsável —";
                const cleanNotes = stripMetaTags(c.notes);
                return (
                  <Card
                    key={c.id}
                    className="p-4 bg-card border-border/50 hover:border-primary/40 transition-smooth cursor-pointer"
                    onClick={() => onOpenClient(c)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        {meta.doctorName && (
                          <div
                            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded mb-1"
                            style={{
                              background: (meta.doctorColor || "hsl(var(--muted))") + "33",
                              color: meta.doctorColor || "hsl(var(--foreground))",
                              border: `1px solid ${meta.doctorColor || "hsl(var(--border))"}55`,
                            }}
                          >
                            <Stethoscope className="h-3 w-3" />
                            {meta.doctorName}
                          </div>
                        )}
                        <h3 className="font-semibold truncate">{c.name}</h3>
                        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {c.phone}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {responsibleName}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {stage && (
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                            style={{
                              background: (stage.color ?? "hsl(var(--muted))") + "22",
                              color: stage.color ?? undefined,
                            }}
                          >
                            {stage.name}
                          </Badge>
                        )}
                        {c.phone && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              openWhatsappWeb(c.phone);
                            }}
                          >
                            <MessageCircle className="h-3 w-3 mr-1" />
                            WhatsApp
                          </Button>
                        )}
                      </div>
                    </div>
                    {cleanNotes && (
                      <pre className="whitespace-pre-wrap text-xs text-muted-foreground/90 font-sans max-h-40 overflow-y-auto border-t border-border/30 pt-2 mt-1">
                        {cleanNotes}
                      </pre>
                    )}
                    <div className="mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                      Abrir detalhes
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
