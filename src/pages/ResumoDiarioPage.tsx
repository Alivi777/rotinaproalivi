import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Info,
  Download,
  FileSpreadsheet,
  History,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useTacticalDailySummary,
  todayInSaoPaulo,
  yesterdayInSaoPaulo,
  type SummaryStatus,
  type Suggestion,
  type DailySummary,
} from "@/hooks/useTacticalDailySummary";
import { toast } from "@/hooks/use-toast";
import {
  DEFAULT_FILTERS,
  buildExportCsv,
  buildExportPayload,
  collectCategories,
  collectDoctors,
  compareKpis,
  downloadCsv,
  downloadJson,
  exportCsvFilename,
  exportFilename,
  filterDoctors,
  filterPriorities,
  filterSuggestions,
  passesStatus,
  type SummaryFilters,
} from "@/lib/resumoDiario";

const NAO_VALIDADO = "NÃO VALIDADO";
const NAO_VALIDADO_TITLE =
  "Sem dados retornados para este período. Isto NÃO significa zero — a fonte pode estar indisponível, sem permissão ou sem registro.";
const PAGE_SIZE = 10;

function DateBtn({ date, onChange, label }: { date: string; onChange: (v: string) => void; label: string }) {
  const parsed = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [date]);
  const labelId = `date-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-[200px] justify-start text-left font-normal"
            aria-labelledby={labelId}
            aria-label={`${label}: ${format(parsed, "PPP", { locale: ptBR })}. Abrir calendário.`}
          >
            <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            {format(parsed, "PPP", { locale: ptBR })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={parsed}
            onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function StatusBadge({ status }: { status: SummaryStatus }) {
  const map: Record<SummaryStatus, { label: string; className: string; icon: JSX.Element; desc: string }> = {
    PASS: { label: "PASS", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />, desc: "Todos os dados retornados com sucesso" },
    PARTIAL: { label: "PARTIAL", className: "bg-amber-500/15 text-amber-600 border-amber-500/40", icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />, desc: "Alguma fonte não retornou dados" },
    BLOCKED: { label: "BLOCKED", className: "bg-destructive/15 text-destructive border-destructive/40", icon: <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />, desc: "Fonte principal indisponível" },
  };
  const v = map[status] ?? map.PARTIAL;
  return (
    <Badge variant="outline" className={cn("gap-1", v.className)} aria-label={`Status ${v.label}: ${v.desc}`}>
      {v.icon}
      {v.label}
    </Badge>
  );
}

function NaoValidado({ reason }: { reason?: string }) {
  const desc = reason ? `${NAO_VALIDADO_TITLE} ${reason}` : NAO_VALIDADO_TITLE;
  return (
    <span
      role="status"
      aria-label={desc}
      title={desc}
      className="text-muted-foreground text-sm italic underline decoration-dotted decoration-muted-foreground/50"
    >
      {NAO_VALIDADO}
      {reason ? <span className="not-italic ml-1 text-xs">— {reason}</span> : null}
    </span>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  const empty = value === null || value === undefined;
  return (
    <div className="rounded-lg border p-4 bg-card" role="group" aria-label={label}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", empty && "text-muted-foreground text-lg")}>
        {empty ? <NaoValidado /> : value}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function priorityColor(p: string) {
  if (p === "high") return "bg-destructive/15 text-destructive border-destructive/40";
  if (p === "medium") return "bg-amber-500/15 text-amber-600 border-amber-500/40";
  return "bg-muted text-muted-foreground";
}

function SuggestionCard({ s }: { s: Suggestion }) {
  const noop = (label: string) => () => toast({ title: `${label} — disponível no PR3`, description: "Nenhuma ação externa é executada ainda." });
  return (
    <div className="rounded-lg border p-4 bg-card space-y-3" role="article" aria-label={`Sugestão ${s.category} prioridade ${s.priority}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("uppercase text-[10px]", priorityColor(s.priority))}>{s.priority}</Badge>
        <Badge variant="secondary" className="uppercase text-[10px]">{s.category}</Badge>
        <span className="text-xs text-muted-foreground">#{s.id}</span>
        {s.requires_approval && <Badge variant="outline" className="text-[10px]">requer aprovação</Badge>}
      </div>
      <p className="text-sm">{s.text || <NaoValidado />}</p>
      <div className="text-xs text-muted-foreground">Ação sugerida: <span className="font-medium text-foreground">{s.suggested_action}</span></div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="default" onClick={noop("Aplicar")} aria-label={`Aplicar sugestão ${s.id}`}>Aplicar</Button>
        <Button size="sm" variant="outline" onClick={noop("Alterar")} aria-label={`Alterar sugestão ${s.id}`}>Alterar</Button>
        <Button size="sm" variant="ghost" onClick={noop("Ignorar")} aria-label={`Ignorar sugestão ${s.id}`}>Ignorar</Button>
      </div>
    </div>
  );
}

const brl = (n: any) =>
  n === null || n === undefined ? null : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtKpi(key: string, v: number | null): React.ReactNode {
  if (v === null) return <NaoValidado />;
  if (key === "revenue" || key === "profit") return brl(v);
  return v.toLocaleString("pt-BR");
}

function DeltaCell({ delta, keyName }: { delta: number | null; keyName: string }) {
  if (delta === null) return <NaoValidado />;
  const cls = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : "text-muted-foreground";
  const sign = delta > 0 ? "+" : "";
  const display = keyName === "revenue" || keyName === "profit"
    ? brl(delta)
    : `${sign}${delta.toLocaleString("pt-BR")}`;
  return <span className={cn("text-xs font-medium", cls)}>{sign}{keyName === "revenue" || keyName === "profit" ? display : display}</span>;
}

function Pager<T>({
  items,
  ariaLabel,
  children,
}: {
  items: T[];
  ariaLabel: string;
  children: (pageItems: T[]) => React.ReactNode;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const clamped = Math.min(page, totalPages - 1);
  const start = clamped * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  return (
    <div className="space-y-2">
      {children(pageItems)}
      {items.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground" role="navigation" aria-label={ariaLabel}>
          <span aria-live="polite">
            Exibindo {start + 1}–{Math.min(start + PAGE_SIZE, items.length)} de {items.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={clamped === 0}
              onClick={() => setPage(clamped - 1)}
              aria-label={`Página anterior de ${ariaLabel}`}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <span className="px-2" aria-current="page">
              {clamped + 1}/{totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={clamped >= totalPages - 1}
              onClick={() => setPage(clamped + 1)}
              aria-label={`Próxima página de ${ariaLabel}`}
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResumoDiarioPage() {
  const [referenceDate, setReferenceDate] = useState<string>(yesterdayInSaoPaulo());
  const [agendaDate, setAgendaDate] = useState<string>(todayInSaoPaulo());

  const [historyOpen, setHistoryOpen] = useState(false);
  const [refB, setRefB] = useState<string>(yesterdayInSaoPaulo());
  const [agendaB, setAgendaB] = useState<string>(todayInSaoPaulo());

  const [filters, setFilters] = useState<SummaryFilters>(DEFAULT_FILTERS);

  const primary = useTacticalDailySummary({ referenceDate, agendaDate });
  const comparison = useTacticalDailySummary({
    referenceDate: refB,
    agendaDate: agendaB,
    enabled: historyOpen,
  });

  const data = primary.data;
  const { isLoading, isFetching, isError, error, refetch } = primary;
  const isAuthError = isError && (error?.status === 401 || error?.status === 403);

  const doctors = useMemo(() => collectDoctors(data), [data]);
  const categories = useMemo(() => collectCategories(data), [data]);

  const filteredDoctors = data ? filterDoctors(data, filters) : [];
  const filteredSuggestions = data ? filterSuggestions(data, filters) : [];
  const filteredPriorities = data ? filterPriorities(data, filters) : [];
  const statusPasses = data ? passesStatus(data, filters) : true;

  const kpiDeltas = useMemo(
    () => compareKpis(data ?? null, comparison.data ?? null),
    [data, comparison.data],
  );

  const chartKpiData = useMemo(
    () =>
      kpiDeltas.map((d) => ({
        label: d.label,
        [`A ${referenceDate}`]: d.a ?? 0,
        [`B ${refB}`]: d.b ?? 0,
      })),
    [kpiDeltas, referenceDate, refB],
  );

  const priorityLineData = useMemo(() => {
    const buckets = ["open", "blocked", "waiting", "in_progress"] as const;
    const countByStatus = (s: DailySummary | null | undefined) => {
      const c: Record<string, number> = {};
      for (const p of s?.open_priorities ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
      return c;
    };
    const a = countByStatus(data ?? null);
    const b = countByStatus(comparison.data ?? null);
    const all = new Set<string>([...buckets, ...Object.keys(a), ...Object.keys(b)]);
    return [...all].map((status) => ({
      status,
      [`A ${referenceDate}`]: a[status] ?? 0,
      [`B ${refB}`]: b[status] ?? 0,
    }));
  }, [data, comparison.data, referenceDate, refB]);

  const handleExport = () => {
    if (!data) return;
    const payload = buildExportPayload(data, {
      generated_at: new Date().toISOString(),
      source: "tactical-daily-summary",
    });
    downloadJson(exportFilename(referenceDate, agendaDate), payload);
    toast({ title: "Exportado", description: "JSON minimizado salvo localmente." });
  };

  const handleExportCsv = () => {
    if (!data) return;
    const csv = buildExportCsv(data, {
      generated_at: new Date().toISOString(),
      source: "tactical-daily-summary",
    });
    downloadCsv(exportCsvFilename(referenceDate, agendaDate), csv);
    toast({ title: "Exportado", description: "CSV com IDs mascarados salvo localmente." });
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const hasFilters =
    filters.query !== "" || filters.doctor !== "all" || filters.category !== "all" || filters.status !== "all";

  return (
    <AppShell>
      <main className="space-y-6 max-w-7xl" aria-labelledby="resumo-title">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="resumo-title" className="text-3xl font-bold tracking-tight">Resumo Diário</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Panorama tático do dia. Ausência de dados aparece como{" "}
              <span className="font-medium" title={NAO_VALIDADO_TITLE}>{NAO_VALIDADO}</span> — nunca zero. Passe o mouse para o motivo.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3" role="toolbar" aria-label="Controles do resumo">
            <DateBtn label="Referência (D-1)" date={referenceDate} onChange={setReferenceDate} />
            <DateBtn label="Agenda (Hoje)" date={agendaDate} onChange={setAgendaDate} />
            <Button
              variant={historyOpen ? "default" : "outline"}
              onClick={() => setHistoryOpen((v) => !v)}
              aria-pressed={historyOpen}
              aria-expanded={historyOpen}
              aria-controls="painel-historico"
            >
              <History className="h-4 w-4 mr-2" aria-hidden="true" />
              Histórico
            </Button>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Recarregar resumo"
              aria-busy={isFetching}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} aria-hidden="true" />
              Recarregar
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={!data} aria-label="Exportar resumo em JSON">
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              JSON
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={!data} aria-label="Exportar resumo em CSV">
              <FileSpreadsheet className="h-4 w-4 mr-2" aria-hidden="true" />
              CSV
            </Button>
          </div>
        </header>

        {historyOpen && (
          <Card id="painel-historico" aria-labelledby="historico-title">
            <CardHeader className="pb-3">
              <CardTitle id="historico-title" className="text-base flex items-center gap-2">
                <History className="h-4 w-4" aria-hidden="true" /> Comparação com outra data (America/Sao_Paulo)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <DateBtn label="Referência B" date={refB} onChange={setRefB} />
                <DateBtn label="Agenda B" date={agendaB} onChange={setAgendaB} />
                {comparison.isFetching && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> carregando comparação…
                  </div>
                )}
                {comparison.isError && (
                  <div className="text-xs text-destructive" role="alert">
                    Falha ao comparar: {comparison.error?.message}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Comparação de KPIs entre datas A e B">
                  <caption className="sr-only">
                    Comparação de KPIs entre {referenceDate} (A) e {refB} (B) no fuso America/Sao_Paulo
                  </caption>
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground border-b">
                      <th scope="col" className="text-left py-2">KPI</th>
                      <th scope="col" className="text-right py-2">A · {referenceDate}</th>
                      <th scope="col" className="text-right py-2">B · {refB}</th>
                      <th scope="col" className="text-right py-2">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiDeltas.map((d) => (
                      <tr key={d.key} className="border-b border-dashed">
                        <th scope="row" className="text-left py-2 font-normal">{d.label}</th>
                        <td className="text-right py-2">{fmtKpi(d.key, d.a)}</td>
                        <td className="text-right py-2">{fmtKpi(d.key, d.b)}</td>
                        <td className="text-right py-2"><DeltaCell delta={d.delta} keyName={d.key} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border p-3" role="img" aria-label="Gráfico de barras comparando KPIs entre A e B">
                  <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> KPIs — barras (A vs B)
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartKpiData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="label" fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                        <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey={`A ${referenceDate}`} fill="hsl(175 84% 48%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey={`B ${refB}`} fill="hsl(38 92% 60%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-lg border p-3" role="img" aria-label="Gráfico de linha comparando prioridades por status entre A e B">
                  <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Prioridades por status (A vs B)
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={priorityLineData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="status" fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                        <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey={`A ${referenceDate}`} stroke="hsl(175 84% 48%)" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey={`B ${refB}`} stroke="hsl(38 92% 60%)" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Prioridades abertas A: {data?.open_priorities.length ?? <NaoValidado />} • B:{" "}
                {comparison.data?.open_priorities.length ?? <NaoValidado />}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filtros locais */}
        <Card aria-labelledby="filtros-title">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="filtros-title">
              <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span id="filtros-title" className="sr-only">Filtros locais</span>
              <label className="sr-only" htmlFor="resumo-busca">Buscar</label>
              <Input
                id="resumo-busca"
                placeholder="Buscar por texto…"
                value={filters.query}
                onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                className="h-8 w-56"
                aria-label="Buscar por texto nos filtros"
              />
              <Select value={filters.doctor} onValueChange={(v) => setFilters((f) => ({ ...f, doctor: v }))}>
                <SelectTrigger className="h-8 w-48" aria-label="Filtrar por profissional"><SelectValue placeholder="Profissional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos profissionais</SelectItem>
                  {doctors.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={filters.category} onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="h-8 w-40" aria-label="Filtrar por categoria"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v as SummaryFilters["status"] }))}
              >
                <SelectTrigger className="h-8 w-36" aria-label="Filtrar por status"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer status</SelectItem>
                  <SelectItem value="PASS">PASS</SelectItem>
                  <SelectItem value="PARTIAL">PARTIAL</SelectItem>
                  <SelectItem value="BLOCKED">BLOCKED</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button size="sm" variant="ghost" onClick={resetFilters} aria-label="Limpar filtros">
                  <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="flex items-center justify-center py-24" role="status" aria-live="polite" aria-label="Carregando resumo diário">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        )}

        {isError && !isLoading && (
          <Alert variant="destructive" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>
              {isAuthError ? (error?.status === 401 ? "Sessão expirada" : "Sem permissão") : "Falha ao carregar resumo"}
            </AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3 mt-2">
              <span>{error?.message}</span>
              {!isAuthError && (
                <Button size="sm" variant="outline" onClick={() => refetch()} aria-label="Tentar carregar novamente">Tentar novamente</Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {data && !isLoading && !statusPasses && (
          <Alert>
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Filtro de status ativo</AlertTitle>
            <AlertDescription>
              O status atual é <strong>{data.status}</strong> mas o filtro está em <strong>{filters.status}</strong>. Ajuste o filtro para ver o conteúdo.
            </AlertDescription>
          </Alert>
        )}

        {data && !isLoading && statusPasses && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={data.status} />
              <Badge variant="outline" className="uppercase text-[10px]">escopo: {data.scope}</Badge>
              <span className="text-xs text-muted-foreground">
                TZ {data.timezone} • período {data.reference_date} → {data.agenda_date} • consultado em{" "}
                {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })} • fontes: {data.sources.join(", ") || <NaoValidado />}
              </span>
            </div>

            {data.data_quality.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Qualidade dos dados</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc ml-5 mt-1 space-y-1 text-sm">
                    {data.data_quality.map((d, i) => (<li key={i}>{d}</li>))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <section aria-labelledby="kpis-title">
              <h2 id="kpis-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">KPIs corporativos (mês)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(() => {
                  const mtd: any = (data.company_kpis as any)?.month_to_date;
                  const note: string | undefined = (data.company_kpis as any)?.note;
                  if (!mtd) {
                    return (
                      <div className="col-span-full text-sm">
                        <NaoValidado reason={note} />
                      </div>
                    );
                  }
                  return (
                    <>
                      <Kpi label="Receita MTD" value={brl(mtd.revenue)} />
                      <Kpi label="Lucro MTD" value={brl(mtd.profit)} />
                      <Kpi label="Novos pacientes" value={mtd.new_patients} />
                      <Kpi label="Vendas registradas" value={mtd.sample_size ?? null} />
                    </>
                  );
                })()}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card aria-labelledby="agenda-title">
                <CardHeader><CardTitle id="agenda-title" className="text-base">Agenda de {data.agenda_date}</CardTitle></CardHeader>
                <CardContent>
                  {data.agenda_today?.available === false ? (
                    <NaoValidado reason={data.agenda_today?.reason} />
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Kpi label="Total" value={data.agenda_today.total ?? null} />
                        <Kpi label="Concluídas" value={data.agenda_today.completed ?? null} />
                      </div>
                      <Separator />
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Por profissional</div>
                        {filteredDoctors.length === 0 ? (
                          <NaoValidado reason="Nenhum profissional retornado ou removido pelo filtro." />
                        ) : (
                          <Pager items={filteredDoctors} ariaLabel="profissionais">
                            {(page) => (
                              <ul className="text-sm space-y-1">
                                {page.map((d) => (
                                  <li key={d.doctor} className="flex justify-between border-b border-dashed py-1">
                                    <span>{d.doctor}</span>
                                    <span className="font-medium">{d.total}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Pager>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card aria-labelledby="rotina-title">
                <CardHeader><CardTitle id="rotina-title" className="text-base">Rotina em {referenceDate}</CardTitle></CardHeader>
                <CardContent>
                  {data.routine_tasks?.available === false ? (
                    <NaoValidado />
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Kpi label="Tarefas ativas" value={data.routine_tasks.total_active ?? null} />
                      <Kpi label="Execuções no escopo" value={data.routine_tasks.completions_in_scope ?? null} />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card aria-labelledby="prioridades-title">
                <CardHeader><CardTitle id="prioridades-title" className="text-base">Prioridades abertas</CardTitle></CardHeader>
                <CardContent>
                  {filteredPriorities.length === 0 ? (
                    <NaoValidado reason="Sem prioridades abertas para o escopo/filtro." />
                  ) : (
                    <Pager items={filteredPriorities} ariaLabel="prioridades">
                      {(page) => (
                        <ul className="text-sm space-y-2">
                          {page.map((p) => (
                            <li key={p.id} className="flex items-center justify-between gap-2 rounded border p-2">
                              <span className="font-mono text-xs" aria-label={`Referência do usuário ${p.user_ref ?? "não validado"}`}>
                                {p.user_ref ?? NAO_VALIDADO}
                              </span>
                              <Badge variant="outline" className="text-[10px] uppercase">{p.status}</Badge>
                              <Badge variant={p.has_mission ? "default" : "secondary"} className="text-[10px]">
                                {p.has_mission ? "missão definida" : "sem missão"}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Pager>
                  )}
                </CardContent>
              </Card>

              <Card aria-labelledby="inativos-title">
                <CardHeader><CardTitle id="inativos-title" className="text-base">Clientes sem interação</CardTitle></CardHeader>
                <CardContent>
                  {data.inactive_clients.length === 0 ? (
                    <NaoValidado reason="Nenhum cliente inativo retornado para o período." />
                  ) : (
                    <Pager items={data.inactive_clients} ariaLabel="clientes sem interação">
                      {(page) => (
                        <ul className="text-sm space-y-1">
                          {page.map((c, i) => (
                            <li key={`${c.client_ref ?? "x"}-${i}`} className="flex justify-between border-b border-dashed py-1">
                              <span className="font-mono text-xs">{c.client_ref ?? NAO_VALIDADO}</span>
                              <span className="text-muted-foreground">
                                {c.last_activity_at ? format(new Date(c.last_activity_at), "dd/MM/yyyy", { locale: ptBR }) : NAO_VALIDADO}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Pager>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card aria-labelledby="gpt-title">
              <CardHeader><CardTitle id="gpt-title" className="text-base">Contexto GPT Maker</CardTitle></CardHeader>
              <CardContent>
                {(!data.gptmaker_context || data.gptmaker_context.length === 0) ? (
                  <NaoValidado reason="Nenhum conteúdo pessoal é armazenado nesta etapa." />
                ) : (
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(data.gptmaker_context, null, 2)}</pre>
                )}
              </CardContent>
            </Card>

            <section aria-labelledby="sugestoes-title">
              <h2 id="sugestoes-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Sugestões táticas {filteredSuggestions.length !== data.suggestions.length && (
                  <span className="text-xs normal-case text-muted-foreground">
                    ({filteredSuggestions.length}/{data.suggestions.length} após filtro)
                  </span>
                )}
              </h2>
              {filteredSuggestions.length === 0 ? (
                <NaoValidado reason="Nenhuma sugestão retornada ou removida pelo filtro." />
              ) : (
                <Pager items={filteredSuggestions} ariaLabel="sugestões">
                  {(page) => (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {page.map((s) => (<SuggestionCard key={s.id} s={s} />))}
                    </div>
                  )}
                </Pager>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Botões Aplicar/Alterar/Ignorar não executam ações externas nesta versão (PR2). Integrações chegam no PR3.
              </p>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}

export type { DailySummary };
