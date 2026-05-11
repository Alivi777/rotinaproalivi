import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarRange,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LayoutGrid,
  Columns3,
} from "lucide-react";
import { useAgendaClinica, getDateRange, dateOnly } from "@/lib/useAgendaClinica";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AgendaTaskCard from "@/components/AgendaTaskCard";
import DoctorKanbanView from "@/components/DoctorKanbanView";

const DAY_LABEL = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

export default function AgendaClinicaPage() {
  const { isAdmin } = useIsAdmin();
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<"day" | "doctor">("doctor");
  const [selectedDay, setSelectedDay] = useState<string>(dateOnly(new Date()));

  const periodDates = useMemo(() => getDateRange(refDate, 30), [refDate]);
  const { tasks, doctors, loading } = useAgendaClinica(periodDates);

  const doctorMap = useMemo(() => {
    const m = new Map(doctors.map((d) => [d.id, d]));
    return m;
  }, [doctors]);

  // Mostra todas as tarefas por dia de execução: confirmações, protocolo,
  // urgência, aniversários e consulta do dia.
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (doctorFilter !== "all" && t.doctor_id !== doctorFilter && doctorFilter !== "none") return false;
      if (doctorFilter === "none" && t.doctor_id !== null) return false;
      if (search && !t.patient_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, doctorFilter, search]);

  const byDay = periodDates.map((d) => {
    const ds = dateOnly(d);
    return filtered.filter((t) => t.task_date === ds);
  });

  function shiftWeek(delta: number) {
    const d = new Date(refDate);
    d.setDate(d.getDate() + delta * 30);
    setRefDate(d);
  }

  async function runSync() {
    setSyncing(true);
    try {
      const start = dateOnly(periodDates[0]);
      const end = dateOnly(periodDates[periodDates.length - 1]);
      const { data, error } = await supabase.functions.invoke("clinicorp-agenda-sync", {
        body: { start_date: start, end_date: end },
      });
      if (error) throw error;
      const d = data as { appointments?: number; tasks_generated?: number };
      toast.success(`Sincronizado ${start} → ${end}: ${d.appointments ?? 0} consultas, ${d.tasks_generated ?? 0} tarefas`);
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarRange className="h-6 w-6 text-primary" />
              Agenda Clínica
            </h1>
            <p className="text-sm text-muted-foreground">
              Agenda da semana — as tarefas (D-7..D-1, aniversários) ficam no kanban da Recepção
            </p>
          </div>
          {isAdmin && (
            <Button onClick={runSync} disabled={syncing} variant="default">
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sincronizar agora
            </Button>
          )}
        </div>

        {/* Filters / week nav */}
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRefDate(new Date())}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => shiftWeek(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="text-sm text-muted-foreground ml-2">
            {periodDates[0].toLocaleDateString("pt-BR")} —{" "}
            {periodDates[periodDates.length - 1].toLocaleDateString("pt-BR")}
          </div>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "day" | "doctor")} className="ml-2">
            <TabsList className="h-9">
              <TabsTrigger value="doctor" className="text-xs gap-1.5">
                <Columns3 className="h-3.5 w-3.5" /> Por Doutor
              </TabsTrigger>
              <TabsTrigger value="day" className="text-xs gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5" /> Por Dia
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="ml-auto flex items-center gap-2">
            <Input
              placeholder="Buscar paciente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 h-9"
            />
            <Select value={doctorFilter} onValueChange={setDoctorFilter}>
              <SelectTrigger className="w-48 h-9">
                <SelectValue placeholder="Doutor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os doutores</SelectItem>
                <SelectItem value="none">Sem doutor</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Day picker (apenas no modo Por Doutor) */}
        {viewMode === "doctor" && (
          <Card className="p-2 flex flex-wrap items-center gap-1">
            <Button
              variant={selectedDay === "" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedDay("")}
              className="h-8 text-xs"
            >
              30 dias
            </Button>
            {periodDates.map((d) => {
              const ds = dateOnly(d);
              const isToday = ds === dateOnly(new Date());
              return (
                <Button
                  key={ds}
                  variant={selectedDay === ds ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedDay(ds)}
                  className="h-8 text-xs"
                >
                  {DAY_LABEL.format(d)}
                  {isToday && <span className="ml-1 text-[9px] opacity-70">(hoje)</span>}
                </Button>
              );
            })}
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Carregando...
          </div>
        ) : viewMode === "doctor" ? (
          <DoctorKanbanView
            tasks={filtered}
            doctors={doctors}
            weekDates={periodDates}
            selectedDate={selectedDay ? new Date(selectedDay + "T12:00:00") : null}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {periodDates.map((date, i) => {
              const label = DAY_LABEL.format(date);
              const dayTasks = byDay[i];
              const isToday = dateOnly(date) === dateOnly(new Date());
              return (
                <div key={dateOnly(date)} className="space-y-2">
                  <div className="flex items-center justify-between px-2">
                    <div className="text-sm font-semibold">
                      {label}
                      {isToday && (
                        <Badge variant="default" className="ml-2 text-[9px] h-4">
                          Hoje
                        </Badge>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {dayTasks.length}
                    </Badge>
                  </div>
                  <div className="space-y-2 min-h-[100px] p-2 rounded-lg bg-muted/30">
                    {dayTasks.length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-6">
                        Sem tarefas
                      </div>
                    )}
                    {dayTasks.map((t) => (
                      <AgendaTaskCard
                        key={t.id}
                        task={t}
                        doctor={t.doctor_id ? doctorMap.get(t.doctor_id) : undefined}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
