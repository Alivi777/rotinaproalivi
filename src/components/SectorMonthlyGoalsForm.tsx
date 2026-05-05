import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSectors } from "@/lib/useProfile";
import { useSectorMetrics, monthStartStr } from "@/lib/useSectorMetrics";
import { Plus, Save, Trash2, Target } from "lucide-react";
import { toast } from "sonner";

const AUTO_SOURCES = [
  { value: "", label: "Manual" },
  { value: "sales_count", label: "Vendas (qtd)" },
  { value: "sales_revenue", label: "Faturamento (R$)" },
  { value: "new_patients", label: "Novos pacientes" },
  { value: "appointments_count", label: "Agendamentos (qtd)" },
  { value: "tasks_done", label: "Tarefas concluídas" },
];

export default function SectorMonthlyGoalsForm() {
  const { sectors } = useSectors();
  const [sectorId, setSectorId] = useState<string>("");
  const [period, setPeriod] = useState<string>(monthStartStr().slice(0, 7));
  const periodMonth = `${period}-01`;
  const { metrics, reload } = useSectorMetrics(sectorId, periodMonth);

  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [newRow, setNewRow] = useState({ label: "", target_text: "", unit: "", auto_source: "" });

  useEffect(() => {
    if (!sectorId && sectors.length) setSectorId(sectors[0].id);
  }, [sectors, sectorId]);

  useEffect(() => {
    setDrafts({});
  }, [sectorId, periodMonth]);

  function setField(id: string, field: string, value: any) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }

  async function saveRow(id: string) {
    const patch = drafts[id];
    if (!patch) return;
    const clean: any = { ...patch };
    if (clean.actual_value === "") clean.actual_value = null;
    if (clean.target_value === "") clean.target_value = null;
    const { error } = await supabase
      .from("sector_monthly_metrics")
      .update(clean)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Meta atualizada");
    setDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    reload();
  }

  async function removeRow(id: string) {
    if (!confirm("Remover este indicador?")) return;
    const { error } = await supabase.from("sector_monthly_metrics").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  }

  async function addRow() {
    if (!sectorId || !newRow.label.trim()) return;
    const max = metrics.length ? Math.max(...metrics.map((m) => m.sort_order)) + 1 : 1;
    const { error } = await supabase.from("sector_monthly_metrics").insert({
      sector_id: sectorId,
      period_month: periodMonth,
      label: newRow.label.trim(),
      target_text: newRow.target_text || null,
      unit: newRow.unit || null,
      auto_source: newRow.auto_source || null,
      sort_order: max,
    });
    if (error) return toast.error(error.message);
    toast.success("Indicador adicionado");
    setNewRow({ label: "", target_text: "", unit: "", auto_source: "" });
    reload();
  }

  async function copyFromPrevMonth() {
    if (!sectorId) return;
    const d = new Date(periodMonth + "T00:00:00");
    d.setMonth(d.getMonth() - 1);
    const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const { data } = await supabase
      .from("sector_monthly_metrics")
      .select("label, target_text, target_value, unit, auto_source, sort_order")
      .eq("sector_id", sectorId)
      .eq("period_month", prev);
    if (!data?.length) return toast.info("Nenhum indicador no mês anterior.");
    const rows = data.map((r) => ({ ...r, sector_id: sectorId, period_month: periodMonth }));
    const { error } = await supabase.from("sector_monthly_metrics").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} indicadores copiados`);
    reload();
  }

  return (
    <Card className="p-5 bg-card border-border/50">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Metas mensais por setor</h3>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <div>
          <Label>Setor</Label>
          <Select value={sectorId} onValueChange={setSectorId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {sectors.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Mês</Label>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={copyFromPrevMonth} className="w-full">
            Copiar do mês anterior
          </Button>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {metrics.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhum indicador para este setor neste mês.
          </p>
        )}
        {metrics.map((m) => {
          const draft = drafts[m.id] ?? {};
          const dirty = Object.keys(draft).length > 0;
          return (
            <div key={m.id} className="grid grid-cols-12 gap-2 items-end p-2 rounded-lg border border-border/40 bg-secondary/30">
              <div className="col-span-12 sm:col-span-4">
                <Label className="text-[10px] uppercase">Indicador</Label>
                <Input
                  defaultValue={m.label}
                  onChange={(e) => setField(m.id, "label", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-[10px] uppercase">Meta</Label>
                <Input
                  defaultValue={m.target_text ?? ""}
                  placeholder="ex: ≥ 28%"
                  onChange={(e) => setField(m.id, "target_text", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-[10px] uppercase">Realizado</Label>
                <Input
                  defaultValue={m.actual_text ?? (m.actual_value ?? "")}
                  placeholder={m.auto_source ? "auto" : "manual"}
                  disabled={!!m.auto_source}
                  onChange={(e) => setField(m.id, "actual_text", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-[10px] uppercase">Fonte</Label>
                <Select
                  defaultValue={m.auto_source ?? ""}
                  onValueChange={(v) => setField(m.id, "auto_source", v || null)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUTO_SOURCES.map((o) => (
                      <SelectItem key={o.value || "manual"} value={o.value || "_manual"}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6 sm:col-span-2 flex gap-1">
                <Button size="sm" variant={dirty ? "default" : "outline"} className="flex-1 h-8" onClick={() => saveRow(m.id)} disabled={!dirty}>
                  <Save className="h-3 w-3 mr-1" /> Salvar
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeRow(m.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border/40 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <Plus className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Novo indicador</span>
        </div>
        <div className="grid grid-cols-12 gap-2">
          <Input
            className="col-span-12 sm:col-span-4 h-8 text-sm"
            placeholder="Indicador (ex: Conversão lead → agendamento)"
            value={newRow.label}
            onChange={(e) => setNewRow({ ...newRow, label: e.target.value })}
          />
          <Input
            className="col-span-6 sm:col-span-3 h-8 text-sm"
            placeholder="Meta (ex: 25%)"
            value={newRow.target_text}
            onChange={(e) => setNewRow({ ...newRow, target_text: e.target.value })}
          />
          <Input
            className="col-span-3 sm:col-span-2 h-8 text-sm"
            placeholder="Unidade"
            value={newRow.unit}
            onChange={(e) => setNewRow({ ...newRow, unit: e.target.value })}
          />
          <Select value={newRow.auto_source} onValueChange={(v) => setNewRow({ ...newRow, auto_source: v === "_manual" ? "" : v })}>
            <SelectTrigger className="col-span-6 sm:col-span-2 h-8 text-xs"><SelectValue placeholder="Fonte" /></SelectTrigger>
            <SelectContent>
              {AUTO_SOURCES.map((o) => (
                <SelectItem key={o.value || "manual"} value={o.value || "_manual"}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="col-span-3 sm:col-span-1 h-8" onClick={addRow}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
