import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSectors } from "@/lib/useProfile";
import { Plus, Trash2, GripVertical, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Stage = {
  id: string;
  sector_id: string | null;
  name: string;
  slug: string;
  color: string | null;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
  active: boolean;
};

const PALETTE = [
  "hsl(217 91% 60%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 60%)",
  "hsl(142 71% 45%)",
  "hsl(0 72% 51%)",
  "hsl(199 89% 48%)",
  "hsl(340 82% 52%)",
];

export default function KanbanStagesAdminPanel() {
  const { sectors } = useSectors();
  const [sectorId, setSectorId] = useState<string>("__default__");
  const [stages, setStages] = useState<Stage[]>([]);
  const [newName, setNewName] = useState("");

  async function load() {
    const q = supabase.from("kanban_stages").select("*").order("sort_order");
    const { data } =
      sectorId === "__default__"
        ? await q.is("sector_id", null)
        : await q.eq("sector_id", sectorId);
    setStages((data ?? []) as Stage[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorId]);

  async function add() {
    if (!newName.trim()) return;
    const order = stages.length ? Math.max(...stages.map((s) => s.sort_order)) + 1 : 1;
    const slug = newName.toLowerCase().replace(/\s+/g, "-").slice(0, 40) + "-" + order;
    const color = PALETTE[stages.length % PALETTE.length];
    const { error } = await supabase.from("kanban_stages").insert({
      sector_id: sectorId === "__default__" ? null : sectorId,
      name: newName.trim(),
      slug,
      color,
      sort_order: order,
    });
    if (error) return toast.error(error.message);
    setNewName("");
    load();
  }

  async function update(id: string, patch: Partial<Stage>) {
    const { error } = await supabase.from("kanban_stages").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("kanban_stages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = stages.findIndex((s) => s.id === id);
    const target = stages[idx + dir];
    if (!target) return;
    await Promise.all([
      supabase.from("kanban_stages").update({ sort_order: target.sort_order }).eq("id", id),
      supabase
        .from("kanban_stages")
        .update({ sort_order: stages[idx].sort_order })
        .eq("id", target.id),
    ]);
    load();
  }

  return (
    <Card className="p-6 bg-card border-border/50">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-lg">Etapas do Kanban</h3>
          <p className="text-xs text-muted-foreground">
            Personalize o funil por setor. Se um setor não tem etapas, usa o padrão.
          </p>
        </div>
        <Select value={sectorId} onValueChange={setSectorId}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">Padrão (todos os setores)</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 mb-4">
        {stages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma etapa cadastrada — o setor usará o padrão.
          </p>
        )}
        {stages.map((s, i) => (
          <div
            key={s.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-secondary/30"
          >
            <div className="flex flex-col">
              <button
                onClick={() => move(s.id, -1)}
                disabled={i === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                ▲
              </button>
              <button
                onClick={() => move(s.id, 1)}
                disabled={i === stages.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <div
              className="h-8 w-8 rounded shrink-0 cursor-pointer ring-2 ring-transparent hover:ring-foreground/20"
              style={{ background: s.color ?? "hsl(var(--muted))" }}
              onClick={() => {
                const next = PALETTE[(PALETTE.indexOf(s.color ?? "") + 1) % PALETTE.length];
                update(s.id, { color: next });
              }}
              title="Clique para trocar cor"
            />
            <Input
              value={s.name}
              onChange={(e) =>
                setStages((prev) =>
                  prev.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x))
                )
              }
              onBlur={(e) => {
                if (e.target.value !== "" && e.target.value !== s.name) {
                  update(s.id, { name: e.target.value });
                }
              }}
              className="flex-1"
            />
            <div className="flex items-center gap-1.5 text-xs">
              <Trophy
                className={cn(
                  "h-3.5 w-3.5",
                  s.is_won ? "text-primary" : "text-muted-foreground"
                )}
              />
              <Switch
                checked={s.is_won}
                onCheckedChange={(v) => update(s.id, { is_won: v, is_lost: v ? false : s.is_lost })}
              />
              <span className="text-muted-foreground">Ganho</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <X
                className={cn(
                  "h-3.5 w-3.5",
                  s.is_lost ? "text-destructive" : "text-muted-foreground"
                )}
              />
              <Switch
                checked={s.is_lost}
                onCheckedChange={(v) => update(s.id, { is_lost: v, is_won: v ? false : s.is_won })}
              />
              <span className="text-muted-foreground">Perdido</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => remove(s.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-3 border-t border-border/50">
        <Input
          placeholder="Nome da nova etapa"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>
    </Card>
  );
}
