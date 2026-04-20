import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { Crosshair, Plus, Send, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Profile = {
  user_id: string;
  display_name: string | null;
  sector_id: string | null;
};

type Priority = {
  id: string;
  user_id: string;
  priority_date: string;
  mission_main: string;
  secondary_1: string | null;
  secondary_2: string | null;
  yesterday_feedback: string | null;
  manager_id: string;
  status: "pending" | "acknowledged" | "questioned";
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function PrioritiesAdminPanel() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Priority | null>(null);
  const [form, setForm] = useState({
    user_id: "",
    mission_main: "",
    secondary_1: "",
    secondary_2: "",
    yesterday_feedback: "",
  });
  const today = todayStr();

  async function load() {
    const [p, pr] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, sector_id"),
      supabase
        .from("daily_priorities")
        .select("*")
        .eq("priority_date", today)
        .order("created_at", { ascending: false }),
    ]);
    if (p.data) setProfiles(p.data as Profile[]);
    if (pr.data) setPriorities(pr.data as Priority[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-priorities")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_priorities" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew(targetUserId?: string) {
    setEditing(null);
    setForm({
      user_id: targetUserId ?? "",
      mission_main: "",
      secondary_1: "",
      secondary_2: "",
      yesterday_feedback: "",
    });
    setOpen(true);
  }

  function openEdit(p: Priority) {
    setEditing(p);
    setForm({
      user_id: p.user_id,
      mission_main: p.mission_main,
      secondary_1: p.secondary_1 ?? "",
      secondary_2: p.secondary_2 ?? "",
      yesterday_feedback: p.yesterday_feedback ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!user) return;
    if (!form.user_id) return toast.error("Escolha um colaborador.");
    if (!form.mission_main.trim()) return toast.error("Defina a missão principal.");

    const payload = {
      user_id: form.user_id,
      mission_main: form.mission_main.trim(),
      secondary_1: form.secondary_1.trim() || null,
      secondary_2: form.secondary_2.trim() || null,
      yesterday_feedback: form.yesterday_feedback.trim() || null,
      manager_id: user.id,
      priority_date: today,
    };

    if (editing) {
      const { error } = await supabase
        .from("daily_priorities")
        .update({ ...payload, status: "pending", acknowledged_at: null })
        .eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Prioridades atualizadas. Status reiniciado para aceite.");
    } else {
      // upsert by (user_id, priority_date)
      const { error } = await supabase
        .from("daily_priorities")
        .upsert(payload, { onConflict: "user_id,priority_date" });
      if (error) return toast.error(error.message);
      toast.success("Prioridades delegadas. Colaborador será alertado.");
    }
    setOpen(false);
  }

  const todayByUser = new Map(priorities.map((p) => [p.user_id, p]));

  return (
    <Card className="p-6 bg-card border-border/50">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Crosshair className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Prioridades do dia</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Delegue 1 missão principal + até 2 secundárias para cada pessoa, com o
            report do dia anterior. O colaborador recebe alerta vermelho a cada 1h
            até confirmar.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openNew()} className="gap-2">
              <Plus className="h-4 w-4" /> Nova delegação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar prioridades" : "Delegar prioridades do dia"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Colaborador</Label>
                <Select
                  value={form.user_id}
                  onValueChange={(v) => setForm({ ...form, user_id: v })}
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a pessoa" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.display_name || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Report do dia anterior</Label>
                <Textarea
                  value={form.yesterday_feedback}
                  onChange={(e) =>
                    setForm({ ...form, yesterday_feedback: e.target.value })
                  }
                  placeholder="O que avançou, o que travou, o que ficou pendente…"
                  rows={3}
                />
              </div>
              <div>
                <Label className="text-destructive">
                  Missão principal de hoje *
                </Label>
                <Input
                  value={form.mission_main}
                  onChange={(e) =>
                    setForm({ ...form, mission_main: e.target.value })
                  }
                  placeholder="Entrega de maior impacto do dia"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Secundária 1</Label>
                  <Input
                    value={form.secondary_1}
                    onChange={(e) =>
                      setForm({ ...form, secondary_1: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Secundária 2</Label>
                  <Input
                    value={form.secondary_2}
                    onChange={(e) =>
                      setForm({ ...form, secondary_2: e.target.value })
                    }
                  />
                </div>
              </div>
              <Button onClick={save} className="w-full gap-2">
                <Send className="h-4 w-4" />
                {editing ? "Atualizar e reiniciar aceite" : "Enviar ao colaborador"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {profiles.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum membro cadastrado.</p>
        )}
        {profiles.map((p) => {
          const pri = todayByUser.get(p.user_id);
          return (
            <div
              key={p.user_id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-smooth",
                pri
                  ? pri.status === "acknowledged"
                    ? "border-primary/30 bg-primary/5"
                    : pri.status === "questioned"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-destructive/40 bg-destructive/5"
                  : "border-border/40 bg-background/30"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">
                  {p.display_name || "Sem nome"}
                </div>
                {pri ? (
                  <div className="text-xs text-muted-foreground truncate">
                    {pri.mission_main}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Sem prioridades hoje
                  </div>
                )}
              </div>
              {pri && (
                <Badge
                  variant={
                    pri.status === "acknowledged"
                      ? "default"
                      : pri.status === "questioned"
                      ? "secondary"
                      : "destructive"
                  }
                  className="gap-1"
                >
                  {pri.status === "acknowledged" && (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Aceita
                    </>
                  )}
                  {pri.status === "questioned" && "Questionada"}
                  {pri.status === "pending" && (
                    <>
                      <AlertTriangle className="h-3 w-3" /> Pendente
                    </>
                  )}
                </Badge>
              )}
              {pri ? (
                <Button size="sm" variant="outline" onClick={() => openEdit(pri)}>
                  Editar
                </Button>
              ) : (
                <Button size="sm" onClick={() => openNew(p.user_id)}>
                  Delegar
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
