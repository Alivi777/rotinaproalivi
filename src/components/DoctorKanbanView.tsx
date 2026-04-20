import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stethoscope } from "lucide-react";
import AgendaTaskCard from "@/components/AgendaTaskCard";
import { ClinicTask, ClinicDoctor, dateOnly } from "@/lib/useAgendaClinica";

interface Props {
  tasks: ClinicTask[];
  doctors: ClinicDoctor[];
  weekDates: Date[];
  selectedDate: Date | null;
}

/**
 * Kanban-style view: one column per doctor (réplica da agenda do Clinicorp).
 * Tarefas vão direto pra coluna do doutor responsável.
 * Aniversários e tarefas sem doutor ficam na coluna "Recepção / Geral".
 */
export default function DoctorKanbanView({ tasks, doctors, weekDates, selectedDate }: Props) {
  const doctorMap = useMemo(() => new Map(doctors.map((d) => [d.id, d])), [doctors]);

  // Filtrar por data selecionada (se houver) ou pegar semana inteira
  const filteredTasks = useMemo(() => {
    if (!selectedDate) return tasks;
    const ds = dateOnly(selectedDate);
    return tasks.filter((t) => t.task_date === ds);
  }, [tasks, selectedDate]);

  // Agrupar por doctor_id (null = Recepção/Geral)
  const groups = useMemo(() => {
    const g = new Map<string | null, ClinicTask[]>();
    g.set(null, []); // Recepção primeiro
    for (const d of doctors) g.set(d.id, []);
    for (const t of filteredTasks) {
      const key = t.doctor_id ?? null;
      const arr = g.get(key);
      if (arr) arr.push(t);
      else g.set(key, [t]);
    }
    // Ordenar tarefas dentro do grupo por horário/data
    for (const arr of g.values()) {
      arr.sort((a, b) => {
        if (a.task_date !== b.task_date) return a.task_date.localeCompare(b.task_date);
        const aT = a.appointment_at ?? "";
        const bT = b.appointment_at ?? "";
        return aT.localeCompare(bT);
      });
    }
    return g;
  }, [filteredTasks, doctors]);

  const dateLabel = selectedDate
    ? selectedDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" })
    : `${weekDates[0].toLocaleDateString("pt-BR")} — ${weekDates[weekDates.length - 1].toLocaleDateString("pt-BR")}`;

  // Ordenar colunas: Recepção primeiro, depois doutores por volume
  const orderedKeys: (string | null)[] = [null, ...doctors.map((d) => d.id)];

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground px-1">
        Mostrando: <span className="font-semibold text-foreground">{dateLabel}</span> ·{" "}
        {filteredTasks.length} tarefas em {orderedKeys.filter((k) => (groups.get(k)?.length ?? 0) > 0).length} colunas
      </div>

      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.max(orderedKeys.length, 1)}, minmax(260px, 1fr))`,
        }}
      >
        {orderedKeys.map((key) => {
          const colTasks = groups.get(key) ?? [];
          if (colTasks.length === 0 && key !== null) return null; // esconde colunas vazias de doutores
          const doctor = key ? doctorMap.get(key) : null;
          const colorStyle = doctor?.color
            ? { borderTopColor: doctor.color, borderTopWidth: 3 }
            : key === null
              ? { borderTopColor: "hsl(var(--primary))", borderTopWidth: 3 }
              : undefined;

          return (
            <Card key={key ?? "geral"} className="p-2 flex flex-col" style={colorStyle}>
              <div className="flex items-center justify-between px-2 py-1.5 border-b mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Stethoscope
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: doctor?.color || "hsl(var(--primary))" }}
                  />
                  <span className="font-semibold text-sm truncate">
                    {doctor?.name || "Recepção / Geral"}
                  </span>
                </div>
                <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                  {colTasks.length}
                </Badge>
              </div>

              <div className="space-y-2 min-h-[100px] overflow-y-auto max-h-[70vh] px-1">
                {colTasks.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    Sem tarefas
                  </div>
                )}
                {colTasks.map((t) => (
                  <AgendaTaskCard
                    key={t.id}
                    task={t}
                    doctor={t.doctor_id ? doctorMap.get(t.doctor_id) : undefined}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
