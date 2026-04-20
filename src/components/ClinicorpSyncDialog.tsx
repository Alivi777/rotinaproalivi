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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [sectorId, setSectorId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    created: number;
    updated: number;
    errors: number;
  } | null>(null);

  async function run() {
    if (!user) return;
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("clinicorp-sync", {
        body: {
          mode,
          sector_id: sectorId || null,
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
      });
      toast({
        title: "Sincronização concluída",
        description: `${data.total} pacientes processados`,
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sincronizar com Clinicorp
          </DialogTitle>
          <DialogDescription>
            Busca pacientes direto da API do Clinicorp e atualiza a base de contatos.
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
                  Pacientes com consulta nos últimos 90 dias + aniversariantes do mês.
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
                  Aniversariantes do mês atual
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Apenas pacientes que fazem aniversário neste mês.
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
                  Aniversariantes de todos os 12 meses + consultas do último ano. Pode
                  demorar alguns minutos.
                </p>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Setor padrão dos contatos importados</Label>
            <Select value={sectorId} onValueChange={setSectorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {result && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-medium">Resultado:</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{result.total} processados</Badge>
                <Badge variant="default">{result.created} novos</Badge>
                <Badge variant="outline">{result.updated} atualizados</Badge>
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
          <Button onClick={run} disabled={!sectorId || running}>
            <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
            {running ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
