import { useMyTodayAssignment } from "@/lib/usePlanning";
import { Card } from "@/components/ui/card";
import { Crosshair, Target } from "lucide-react";

export default function MyAssignmentCard() {
  const { assignment, loading } = useMyTodayAssignment();
  if (loading || !assignment) return null;

  return (
    <Card className="p-5 mb-6 bg-gradient-card border-primary/40 shadow-glow">
      <div className="flex items-center gap-2 mb-3">
        <Crosshair className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">Suas 3 prioridades de hoje (gestor)</h2>
      </div>
      <div className="space-y-2">
        <div className="flex items-start gap-2 p-2 rounded bg-primary/10 border border-primary/30">
          <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-primary font-bold">Missão principal</div>
            <div className="text-sm font-medium">{assignment.main_mission}</div>
          </div>
        </div>
        {assignment.secondary_1 && (
          <div className="flex items-start gap-2 p-2 rounded border border-border/50">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">Sec 1</span>
            <div className="text-sm">{assignment.secondary_1}</div>
          </div>
        )}
        {assignment.secondary_2 && (
          <div className="flex items-start gap-2 p-2 rounded border border-border/50">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">Sec 2</span>
            <div className="text-sm">{assignment.secondary_2}</div>
          </div>
        )}
        {assignment.observation && (
          <p className="text-xs text-muted-foreground italic mt-2">{assignment.observation}</p>
        )}
      </div>
    </Card>
  );
}
