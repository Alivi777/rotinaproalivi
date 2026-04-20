import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSectors } from "@/lib/useProfile";
import { RefreshCw, Zap, CalendarDays } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
};

type Mode = "recent" | "full" | "birthdays_month";

export default function ClinicorpSyncDialog({ open, onOpenChange, onDone }: Props) {
  const { user } = useAuth();
  const { sectors } = useSectors();
  const [mode, setMode] = useState<Mode>("recent");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    created: number;
    updated: number;
    errors: number;
    appointments_scanned?: number;
    sectors_used?: number;
  } | null>(null);

  function toggleSector(id: string) {
    setSelectedSectors((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function run() {
    if (!user) return;
    if (selectedSectors.length === 0) {
      toast({
        title: "Selecione ao menos 1 setor",
        description: "Os contatos importados serão distribuídos entre os setores escolhidos.",
        variant: "destructive",
      });
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("clinicorp-sync", {
        body: {
          mode,
          sector_ids: selectedSectors,
          user_id: user.id,
          days_back: mode === "recent" ? 90 : 365,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na sincronização");
      setResult({
        total: data.total,
        created: data.created,
        updated: data.updated,
        errors: data.errors,
        appointments_scanned: data.appointments_scanned,
        sectors_used: data.sectors_used,
      });
      toast({
        title: "Sincronização concluída",
        description: `${data.total} pacientes processados (${data.appointments_scanned ?? 0} agendamentos analisados)`,
      });
      onDone();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast({
        title: "Erro na sincronização",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sincronizar com Clinicorp
          </DialogTitle>
          <DialogDescription>
            Busca pacientes via agenda do Clinicorp e atualiza a base de contatos. Distribui
            entre os setores selecionados (round-robin).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Modo de sincronização</Label>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setMode("recent")}
                className={`text-left rounded-lg border p-3 transition ${
                  mode === "recent" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Zap className="h-4 w-4" />
                  Rápida (recomendado)
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pacientes com agenda nos últimos 90 dias + próximos 60 dias.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("birthdays_month")}
                className={`text-left rounded-lg border p-3 transition ${
                  mode === "birthdays_month" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2 font-medium text-sm">
                  <CalendarDays className="h-4 w-4" />
                  Janela de 60 dias (atual)
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Janela curta: 30 dias para trás + 30 dias à frente.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("full")}
                className={`text-left rounded-lg border p-3 transition ${
                  mode === "full" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2 font-medium text-sm">
                  <RefreshCw className="h-4 w-4" />
                  Carga completa (primeira vez)
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Último ano + próximos 6 meses de agenda. Pode demorar alguns minutos.
                </p>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Setores que receberão os contatos</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setSelectedSectors(sectors.map((s) => s.id))}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => setSelectedSectors([])}
                >
                  Nenhum
                </button>
              </div>
            </div>
            <div className="grid gap-2 rounded-lg border p-2">
              {sectors.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded p-2 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedSectors.includes(s.id)}
                    onCheckedChange={() => toggleSector(s.id)}
                  />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
              {sectors.length === 0 && (
                <p className="text-xs text-muted-foreground p-2">
                  Nenhum setor cadastrado.
                </p>
              )}
            </div>
            {selectedSectors.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Os contatos serão distribuídos em rodízio entre os {selectedSectors.length}{" "}
                setores selecionados.
              </p>
            )}
          </div>

          {result && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-medium">Resultado:</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{result.total} pacientes</Badge>
                <Badge variant="default">{result.created} novos</Badge>
                <Badge variant="outline">{result.updated} atualizados</Badge>
                {result.appointments_scanned !== undefined && (
                  <Badge variant="outline">
                    {result.appointments_scanned} agendamentos
                  </Badge>
                )}
                {result.errors > 0 && (
                  <Badge variant="destructive">{result.errors} erros</Badge>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            Fechar
          </Button>
          <Button
            onClick={run}
            disabled={selectedSectors.length === 0 || running}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
            {running ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
