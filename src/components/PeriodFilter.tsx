import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon } from "lucide-react";
import { spToday, spWeekStart, spMonthStart, spYearStart, spDaysAgo } from "@/lib/spTime";

export type PeriodPreset = "today" | "week" | "month" | "30d" | "year" | "custom";

export type PeriodValue = {
  preset: PeriodPreset;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
};

export function defaultPeriod(preset: PeriodPreset = "week"): PeriodValue {
  return periodFromPreset(preset);
}

export function periodFromPreset(preset: PeriodPreset, current?: PeriodValue): PeriodValue {
  const today = spToday();
  switch (preset) {
    case "today": return { preset, from: today, to: today };
    case "week": return { preset, from: spWeekStart(), to: today };
    case "month": return { preset, from: spMonthStart(), to: today };
    case "30d": return { preset, from: spDaysAgo(29), to: today };
    case "year": return { preset, from: spYearStart(), to: today };
    case "custom": return { preset, from: current?.from ?? spMonthStart(), to: current?.to ?? today };
  }
}

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "30d", label: "30 dias" },
  { value: "year", label: "Ano" },
  { value: "custom", label: "Personalizado" },
];

export default function PeriodFilter({
  value,
  onChange,
  className,
}: {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  className?: string;
}) {
  const showCustom = value.preset === "custom";
  return (
    <div className={`flex flex-wrap items-end gap-2 ${className ?? ""}`}>
      <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5 bg-secondary/30">
        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground ml-1.5" />
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            size="sm"
            variant={value.preset === p.value ? "default" : "ghost"}
            className="h-7 px-2.5 text-xs"
            onClick={() => onChange(periodFromPreset(p.value, value))}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {showCustom && (
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-widest">De</Label>
            <Input
              type="date"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="h-8 w-36"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest">Até</Label>
            <Input
              type="date"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="h-8 w-36"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function usePeriodLabel(v: PeriodValue) {
  return useMemo(() => {
    const fmt = (s: string) =>
      new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    if (v.from === v.to) return fmt(v.from);
    return `${fmt(v.from)} → ${fmt(v.to)}`;
  }, [v.from, v.to]);
}
