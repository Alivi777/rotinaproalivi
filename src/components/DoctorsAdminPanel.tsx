import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Plus, Stethoscope } from "lucide-react";

type Doctor = {
  id: string;
  external_id: string | null;
  name: string;
  assigned_user_id: string | null;
  color: string | null;
  active: boolean;
};

type Profile = { user_id: string; display_name: string | null };

export default function DoctorsAdminPanel() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [d, p, a] = await Promise.all([
      supabase.from("clinic_doctors").select("*"),
      supabase.from("profiles").select("user_id, display_name").eq("is_active", true).order("display_name"),
      supabase
        .from("clinic_appointments")
        .select("doctor_external_id")
        .gte("appointment_at", new Date().toISOString()),
    ]);
    const c = new Map<string, number>();
    for (const row of (a.data || []) as { doctor_external_id: string | null }[]) {
      if (row.doctor_external_id) c.set(row.doctor_external_id, (c.get(row.doctor_external_id) || 0) + 1);
    }
    const sorted = ((d.data || []) as Doctor[]).sort((x, y) => {
      const cx = x.external_id ? c.get(x.external_id) || 0 : 0;
      const cy = y.external_id ? c.get(y.external_id) || 0 : 0;
      return cy - cx;
    });
    setDoctors(sorted);
    setProfiles((p.data || []) as Profile[]);
    setCounts(c);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function update(id: string, patch: Partial<Doctor>) {
    const { error } = await supabase.from("clinic_doctors").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Atualizado");
      load();
    }
  }

  async function addDoctor() {
    if (!newName.trim()) return;
    const { error } = await supabase.from("clinic_doctors").insert({ name: newName.trim() });
    if (error) toast.error(error.message);
    else {
      toast.success("Doutor criado");
      setNewName("");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Stethoscope className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Doutores e responsáveis</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-2">
          Renomeie cada profissional <strong>exatamente como está na agenda do Clinicorp</strong>,
          atribua o responsável (ex: Rafaely para Davi/Mariane/Natasha; Layene para Wanessa/Allan)
          e <strong>marque como ativo apenas os que aparecerão na agenda clínica</strong>.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          A coluna <strong>consultas</strong> mostra quantos agendamentos cada ID tem nos próximos
          30 dias — use isso pra identificar quem é quem (o de maior volume costuma ser a Agenda
          Geral ou a profissional mais cheia).
        </p>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Nome do doutor (ex: Dra. Carla)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDoctor()}
          />
          <Button onClick={addDoctor}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-2">
            {doctors.map((d) => (
              <Card key={d.id} className="p-3 flex flex-wrap items-center gap-3">
                <Input
                  value={d.name}
                  onChange={(e) =>
                    setDoctors((arr) => arr.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)))
                  }
                  onBlur={(e) => e.target.value !== d.name && update(d.id, { name: e.target.value })}
                  className="flex-1 min-w-[150px]"
                />
                <Select
                  value={d.assigned_user_id ?? "none"}
                  onValueChange={(v) => update(d.id, { assigned_user_id: v === "none" ? null : v })}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Responsável..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— sem responsável —</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.display_name || p.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="color"
                  value={d.color ?? "#888888"}
                  onChange={(e) => update(d.id, { color: e.target.value })}
                  className="w-14 h-9 p-1"
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={d.active}
                    onCheckedChange={(v) => update(d.id, { active: v })}
                  />
                  <span className="text-xs text-muted-foreground">Ativo</span>
                </div>
                {d.external_id && (
                  <div className="text-[10px] text-muted-foreground font-mono">
                    ext: {d.external_id}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
