import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, TrendingUp } from "lucide-react";
import { useSectors } from "@/lib/useProfile";
import { useSectorMetrics, monthStartStr, computeAutoMetrics, GENERAL_SECTOR } from "@/lib/useSectorMetrics";

type Props = {
  /** Setor padrão (ex: setor do colaborador). Se omitido, mostra abas de todos. */
  defaultSectorId?: string | null;
  /** Se true, exibe abas para o usuário trocar de setor. */
  showSectorTabs?: boolean;
  compact?: boolean;
  title?: string;
};

export default function SectorResultsPanel({
  defaultSectorId,
  showSectorTabs = true,
  compact = false,
  title = "Resultados do mês",
}: Props) {
  const { sectors } = useSectors();
  const period = monthStartStr();
  const [activeSectorId, setActiveSectorId] = useState<string>(defaultSectorId ?? "");
  const [autoValues, setAutoValues] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!activeSectorId && defaultSectorId) setActiveSectorId(defaultSectorId);
    else if (!activeSectorId && sectors.length) setActiveSectorId(sectors[0].id);
  }, [defaultSectorId, sectors, activeSectorId]);

  useEffect(() => {
    computeAutoMetrics(period).then(setAutoValues);
  }, [period]);

  const { metrics } = useSectorMetrics(activeSectorId, period);

  const monthLabel = useMemo(
    () =>
      new Date(period + "T00:00:00").toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      }),
    [period]
  );

  return (
    <Card className="p-5 bg-gradient-card border-border/50">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm uppercase tracking-wider">
            {title}
          </h3>
          <Badge variant="outline" className="text-[10px] capitalize">{monthLabel}</Badge>
        </div>
        {showSectorTabs && sectors.length > 0 && (
          <Tabs value={activeSectorId} onValueChange={setActiveSectorId}>
            <TabsList className="h-8 flex-wrap">
              {sectors.map((s) => (
                <TabsTrigger key={s.id} value={s.id} className="h-7 text-xs px-2">
                  {s.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      {metrics.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Nenhuma meta definida para este setor neste mês.
        </p>
      ) : (
        <ul className={compact ? "space-y-1.5" : "space-y-2"}>
          {metrics.map((m) => {
            const auto = m.auto_source ? autoValues[m.auto_source] : undefined;
            const actualNum = auto ?? m.actual_value ?? null;
            const actualDisplay =
              actualNum !== null
                ? `${actualNum}${m.unit ? ` ${m.unit}` : ""}`
                : m.actual_text || "—";
            const pct =
              m.target_value && actualNum !== null
                ? Math.min(100, Math.round((actualNum / m.target_value) * 100))
                : null;
            return (
              <li
                key={m.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-secondary/40 border border-border/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{m.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      <span className="text-foreground font-semibold">{actualDisplay}</span>
                      {m.target_text && <> · meta {m.target_text}</>}
                    </span>
                  </div>
                  {pct !== null && (
                    <div className="h-1.5 mt-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-gradient-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
                {m.auto_source && (
                  <Badge variant="secondary" className="h-5 text-[10px] gap-1">
                    <TrendingUp className="h-3 w-3" /> auto
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
