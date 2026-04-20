import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageCircle, Stethoscope, Clock } from "lucide-react";
import {
  ClinicTask,
  ClinicDoctor,
  TASK_TYPE_LABEL,
  TASK_TYPE_COLOR,
  completeTask,
  uncompleteTask,
} from "@/lib/useAgendaClinica";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
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

export default function AgendaTaskCard({ task, doctor }: Props) {
  const { user } = useAuth();
  const done = task.status === "done";
  const wa = waLink(task.patient_phone);

  async function toggle() {
    if (!user) return;
    const res = done ? await uncompleteTask(task.id) : await completeTask(task.id, user.id);
    if (res.error) {
      toast.error("Erro ao atualizar tarefa");
    } else {
      toast.success(done ? "Tarefa reaberta" : "Tarefa concluída");
    }
  }

  return (
    <Card
      className={cn(
        "p-3 space-y-2 transition-all hover:shadow-md",
        done && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={done}
          onCheckedChange={toggle}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className={cn("font-medium text-sm leading-snug truncate", done && "line-through")}>
            {task.patient_name}
          </div>
          {task.appointment_at && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3" />
              {fmtTime(task.appointment_at)}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge
          variant="outline"
          className={cn("text-[10px] font-medium border", TASK_TYPE_COLOR[task.task_type] || "")}
        >
          {TASK_TYPE_LABEL[task.task_type] || task.task_type}
        </Badge>
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
        <Button
          asChild
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs"
        >
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3 w-3 mr-1" />
            WhatsApp
          </a>
        </Button>
      )}
    </Card>
  );
}
