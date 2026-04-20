import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Clock, Save } from "lucide-react";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Row = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
};

export default function WorkingHoursPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>(
    DAYS.map((_, i) => ({
      day_of_week: i,
      start_time: "08:00",
      end_time: "18:00",
      active: i >= 1 && i <= 5,
    })),
  );

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("user_working_hours")
      .select("day_of_week, start_time, end_time, active")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        setRows((prev) =>
          prev.map((r) => {
            const f = data.find((d) => d.day_of_week === r.day_of_week);
            return f
              ? {
                  day_of_week: r.day_of_week,
                  start_time: f.start_time.slice(0, 5),
                  end_time: f.end_time.slice(0, 5),
                  active: f.active,
                }
              : r;
          }),
        );
      });
  }, [user?.id]);

  async function save() {
    if (!user?.id) return;
    await supabase.from("user_working_hours").delete().eq("user_id", user.id);
    const { error } = await supabase.from("user_working_hours").insert(
      rows.map((r) => ({
        user_id: user.id,
        day_of_week: r.day_of_week,
        start_time: r.start_time,
        end_time: r.end_time,
        active: r.active,
      })),
    );
    if (error) toast.error(error.message);
    else toast.success("Horário de trabalho salvo");
  }

  return (
    <Card className="p-6 bg-card border-border/50">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Meu horário de trabalho</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Usado para distribuir automaticamente novas conversas do WhatsApp apenas
        para quem está em horário.
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={r.day_of_week}
            className="flex items-center gap-3 flex-wrap p-2 rounded bg-background/40"
          >
            <div className="w-24 text-sm font-medium">{DAYS[r.day_of_week]}</div>
            <Switch
              checked={r.active}
              onCheckedChange={(v) => {
                const c = [...rows];
                c[i] = { ...c[i], active: v };
                setRows(c);
              }}
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs">De</Label>
              <Input
                type="time"
                value={r.start_time}
                disabled={!r.active}
                onChange={(e) => {
                  const c = [...rows];
                  c[i] = { ...c[i], start_time: e.target.value };
                  setRows(c);
                }}
                className="w-28"
              />
              <Label className="text-xs">até</Label>
              <Input
                type="time"
                value={r.end_time}
                disabled={!r.active}
                onChange={(e) => {
                  const c = [...rows];
                  c[i] = { ...c[i], end_time: e.target.value };
                  setRows(c);
                }}
                className="w-28"
              />
            </div>
          </div>
        ))}
      </div>
      <Button onClick={save} className="mt-4">
        <Save className="h-4 w-4 mr-1" /> Salvar
      </Button>
    </Card>
  );
}
