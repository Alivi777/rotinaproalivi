import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useSectors } from "@/lib/useProfile";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";

// Palette of HSL semantic-friendly colors. We use direct HSL strings here because
// Recharts needs raw color values (it doesn't process Tailwind classes).
const SECTOR_COLORS = [
  "hsl(175 84% 48%)",
  "hsl(188 90% 60%)",
  "hsl(38 92% 60%)",
  "hsl(142 70% 55%)",
  "hsl(280 75% 65%)",
  "hsl(0 75% 62%)",
  "hsl(220 80% 65%)",
];

type Row = {
  date: string; // "2026-04-14"
  label: string; // "seg 14"
  [sectorName: string]: string | number;
};

function lastNDays(n: number) {
  const out: { iso: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = d
      .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" })
      .replace(".", "");
    out.push({ iso, label });
  }
  return out;
}

export default function WeeklyAdherenceChart() {
  const { sectors } = useSectors();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sectors.length === 0) return;
    (async () => {
      setLoading(true);
      const days = lastNDays(7);
      const startDate = days[0].iso;

      const [tasksRes, compsRes] = await Promise.all([
        supabase.from("routine_tasks").select("id, sector_id").eq("active", true),
        supabase
          .from("task_completions")
          .select("task_id, completion_date")
          .gte("completion_date", startDate),
      ]);

      const tasks = tasksRes.data ?? [];
      const comps = compsRes.data ?? [];

      const tasksBySector = new Map<string, Set<string>>();
      for (const t of tasks) {
        if (!t.sector_id) continue;
        if (!tasksBySector.has(t.sector_id)) tasksBySector.set(t.sector_id, new Set());
        tasksBySector.get(t.sector_id)!.add(t.id);
      }

      const data: Row[] = days.map(({ iso, label }) => {
        const row: Row = { date: iso, label };
        for (const s of sectors) {
          const sTaskIds = tasksBySector.get(s.id) ?? new Set();
          if (sTaskIds.size === 0) {
            row[s.name] = 0;
            continue;
          }
          const doneIds = new Set(
            comps
              .filter((c) => c.completion_date === iso && sTaskIds.has(c.task_id))
              .map((c) => c.task_id)
          );
          row[s.name] = Math.round((doneIds.size / sTaskIds.size) * 100);
        }
        return row;
      });

      setRows(data);
      setLoading(false);
    })();
  }, [sectors]);

  const sectorNames = useMemo(() => sectors.map((s) => s.name), [sectors]);

  return (
    <Card className="p-6 bg-gradient-card border-border/50">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Aderência semanal</h2>
          <p className="text-xs text-muted-foreground">
            % de tarefas concluídas por setor nos últimos 7 dias
          </p>
        </div>
        <TrendingUp className="h-4 w-4 text-primary" />
      </div>

      {loading ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value}%`, ""]}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              {sectorNames.map((name, idx) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={SECTOR_COLORS[idx % SECTOR_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
