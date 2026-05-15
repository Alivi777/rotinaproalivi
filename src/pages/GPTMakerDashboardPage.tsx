import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useGPTMakerMetrics } from "@/lib/useGPTMakerMetrics";
import {
  MessageCircle,
  Users,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Bot,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

const PRESETS: { label: string; days: number }[] = [
  { label: "Hoje", days: 0 },
  { label: "7 dias", days: 6 },
  { label: "30 dias", days: 29 },
  { label: "90 dias", days: 89 },
];

export default function GPTMakerDashboardPage() {
  const [start, setStart] = useState(isoDaysAgo(6));
  const [end, setEnd] = useState(isoToday());

  const { metrics, loading, reload } = useGPTMakerMetrics(start, end);

  const isEmpty = !loading && metrics && metrics.totalMessages === 0;

  const responseRatePct = useMemo(
    () => Math.round((metrics?.responseRate ?? 0) * 100),
    [metrics],
  );

  function applyPreset(days: number) {
    setStart(isoDaysAgo(days));
    setEnd(isoToday());
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Dashboard GPT Maker
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Métricas de atendimento, volume de conversas e principais clientes.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Filtros */}
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start" className="text-xs">
                Início
              </Label>
              <Input
                id="start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end" className="text-xs">
                Fim
              </Label>
              <Input
                id="end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant="ghost"
                  onClick={() => applyPreset(p.days)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* Banner informativo quando não há dados */}
        {isEmpty && (
          <Card className="p-4 border-dashed border-primary/30 bg-primary/5">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Nenhuma mensagem do GPT Maker no período.</p>
                <p className="text-muted-foreground">
                  Os dados aparecem aqui automaticamente quando o webhook do GPT Maker
                  envia mensagens para esta plataforma. Cada mensagem é vinculada ao
                  cliente pelo telefone.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Mensagens"
            value={metrics?.totalMessages ?? 0}
            icon={<MessageCircle className="h-4 w-4" />}
            loading={loading}
          />
          <KpiCard
            label="Conversas (clientes)"
            value={metrics?.conversations ?? 0}
            icon={<Users className="h-4 w-4" />}
            loading={loading}
          />
          <KpiCard
            label="Taxa de resposta"
            value={`${responseRatePct}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            loading={loading}
            hint="% de clientes que receberam resposta após enviarem mensagem"
          />
          <KpiCard
            label="Média de mensagens / conversa"
            value={(metrics?.avgMessagesPerConversation ?? 0).toFixed(1)}
            icon={<Bot className="h-4 w-4" />}
            loading={loading}
          />
        </div>

        {/* Inbound vs Outbound */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  Recebidas (cliente)
                </div>
                <div className="text-2xl font-bold mt-1">
                  {loading ? <Skeleton className="h-8 w-20" /> : metrics?.inbound ?? 0}
                </div>
              </div>
              <ArrowDownLeft className="h-8 w-8 text-blue-500" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  Enviadas (bot/atendente)
                </div>
                <div className="text-2xl font-bold mt-1">
                  {loading ? <Skeleton className="h-8 w-20" /> : metrics?.outbound ?? 0}
                </div>
              </div>
              <ArrowUpRight className="h-8 w-8 text-emerald-500" />
            </div>
          </Card>
        </div>

        {/* Gráfico diário */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Volume diário</h2>
              <p className="text-xs text-muted-foreground">
                Mensagens recebidas e enviadas por dia
              </p>
            </div>
          </div>
          <div className="h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (metrics?.daily.length ?? 0) === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Sem dados no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics?.daily ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="inbound"
                    name="Recebidas"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="outbound"
                    name="Enviadas"
                    fill="hsl(var(--accent))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Top clientes */}
        <Card className="p-4">
          <div className="mb-3">
            <h2 className="font-semibold">Principais clientes</h2>
            <p className="text-xs text-muted-foreground">
              Top 10 clientes por volume de mensagens no período
            </p>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (metrics?.topClients.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sem clientes no período
            </p>
          ) : (
            <div className="divide-y">
              {metrics?.topClients.map((c, i) => (
                <div
                  key={c.client_id}
                  className="flex items-center justify-between py-2.5 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-muted-foreground w-5 text-right">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Última: {new Date(c.lastAt).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="flex-shrink-0">
                    {c.total} msg
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  icon,
  loading,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  loading?: boolean;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            {label}
          </div>
          <div className="text-2xl font-bold mt-1">
            {loading ? <Skeleton className="h-8 w-16" /> : value}
          </div>
          {hint && (
            <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
              {hint}
            </div>
          )}
        </div>
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      </div>
    </Card>
  );
}
