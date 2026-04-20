import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, Stethoscope, Clock } from "lucide-react";
import { ClinicTask, ClinicDoctor } from "@/lib/useAgendaClinica";
import { cn } from "@/lib/utils";

interface Props {
  task: ClinicTask;
  doctor?: ClinicDoctor;
}

function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function waLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

/**
 * Card simplificado da Agenda Clínica: nome, horário, doutor e WhatsApp.
 * Ações de tarefa (concluir, badges de tipo) foram movidas para o
 * kanban de Recepção (gerado pela função clinic-tasks-to-reception).
 */
export default function AgendaTaskCard({ task, doctor }: Props) {
  const wa = waLink(task.patient_phone);
  const time = fmtTime(task.appointment_at);

  return (
    <Card className={cn("p-3 space-y-2 transition-all hover:shadow-md")}>
      <div className="font-medium text-sm leading-snug truncate">
        {task.patient_name}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {time && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {time}
          </span>
        )}
        {task.doctor_name && (
          <Badge
            variant="outline"
            className="text-[10px] flex items-center gap-1"
            style={
              doctor?.color
                ? { borderColor: doctor.color, color: doctor.color }
                : undefined
            }
          >
            <Stethoscope className="h-2.5 w-2.5" />
            {task.doctor_name}
          </Badge>
        )}
      </div>

      {wa && (
        <Button asChild size="sm" variant="outline" className="w-full h-7 text-xs">
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3 w-3 mr-1" />
            WhatsApp
          </a>
        </Button>
      )}
    </Card>
  );
}
