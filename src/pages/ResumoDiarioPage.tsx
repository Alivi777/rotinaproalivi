import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert, Info } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  useTacticalDailySummary,
  todayInSaoPaulo,
  yesterdayInSaoPaulo,
  type SummaryStatus,
  type Suggestion,
} from "@/hooks/useTacticalDailySummary";
import { toast } from "@/hooks/use-toast";

const NAO_VALIDADO = "NÃO VALIDADO";

function DateBtn({ date, onChange, label }: { date: string; onChange: (v: string) => void; label: string }) {
  const parsed = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [date]);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[220px] justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
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
  const map: Record<SummaryStatus, { label: string; className: string; icon: JSX.Element }> = {
    PASS: { label: "PASS", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    PARTIAL: { label: "PARTIAL", className: "bg-amber-500/15 text-amber-600 border-amber-500/40", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    BLOCKED: { label: "BLOCKED", className: "bg-destructive/15 text-destructive border-destructive/40", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  };
  const v = map[status] ?? map.PARTIAL;
  return (
    <Badge variant="outline" className={cn("gap-1", v.className)}>
      {v.icon}
      {v.label}
    </Badge>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  const empty = value === null || value === undefined;
  return (
    <div className="rounded-lg border p-4 bg-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", empty && "text-muted-foreground text-lg")}>{empty ? NAO_VALIDADO : value}</div>
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
    <div className="rounded-lg border p-4 bg-card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("uppercase text-[10px]", priorityColor(s.priority))}>{s.priority}</Badge>
        <Badge variant="secondary" className="uppercase text-[10px]">{s.category}</Badge>
        <span className="text-xs text-muted-foreground">#{s.id}</span>
        {s.requires_approval && <Badge variant="outline" className="text-[10px]">requer aprovação</Badge>}
      </div>
      <p className="text-sm">{s.text || NAO_VALIDADO}</p>
      <div className="text-xs text-muted-foreground">Ação sugerida: <span className="font-medium text-foreground">{s.suggested_action}</span></div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="default" onClick={noop("Aplicar")}>Aplicar</Button>
        <Button size="sm" variant="outline" onClick={noop("Alterar")}>Alterar</Button>
        <Button size="sm" variant="ghost" onClick={noop("Ignorar")}>Ignorar</Button>
      </div>
    </div>
  );
}

export default function ResumoDiarioPage() {
  const [referenceDate, setReferenceDate] = useState<string>(yesterdayInSaoPaulo());
  const [agendaDate, setAgendaDate] = useState<string>(todayInSaoPaulo());

  const { data, isLoading, isFetching, isError, error, refetch } = useTacticalDailySummary({
    referenceDate,
    agendaDate,
  });

  const isAuthError = isError && (error?.status === 401 || error?.status === 403);

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Resumo Diário</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Panorama tático do dia. Ausência de dados aparece como <span className="font-medium">{NAO_VALIDADO}</span>, nunca zero.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <DateBtn label="Referência (D-1)" date={referenceDate} onChange={setReferenceDate} />
            <DateBtn label="Agenda (Hoje)" date={agendaDate} onChange={setAgendaDate} />
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              Recarregar
            </Button>
          </div>
        </header>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {isError && !isLoading && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {isAuthError ? (error?.status === 401 ? "Sessão expirada" : "Sem permissão") : "Falha ao carregar resumo"}
            </AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3 mt-2">
              <span>{error?.message}</span>
              {!isAuthError && (
                <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {data && !isLoading && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={data.status} />
              <Badge variant="outline" className="uppercase text-[10px]">escopo: {data.scope}</Badge>
              <span className="text-xs text-muted-foreground">TZ {data.timezone} • fontes: {data.sources.join(", ") || NAO_VALIDADO}</span>
            </div>

            {data.data_quality.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Qualidade dos dados</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc ml-5 mt-1 space-y-1 text-sm">
                    {data.data_quality.map((d, i) => (<li key={i}>{d}</li>))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">KPIs corporativos (mês)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(() => {
                  const mtd: any = (data.company_kpis as any)?.month_to_date;
                  const note: string | undefined = (data.company_kpis as any)?.note;
                  if (!mtd) {
                    return (
                      <div className="col-span-full text-sm text-muted-foreground">{note ?? NAO_VALIDADO}</div>
                    );
                  }
                  const brl = (n: any) => (n === null || n === undefined) ? null : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
              <Card>
                <CardHeader><CardTitle className="text-base">Agenda de {data.agenda_date}</CardTitle></CardHeader>
                <CardContent>
                  {data.agenda_today?.available === false ? (
                    <div className="text-sm text-muted-foreground">{NAO_VALIDADO} — {data.agenda_today?.reason}</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Kpi label="Total" value={data.agenda_today.total ?? null} />
                        <Kpi label="Concluídas" value={data.agenda_today.completed ?? null} />
                      </div>
                      <Separator />
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Por profissional</div>
                        {(data.agenda_today.by_doctor?.length ?? 0) === 0 ? (
                          <div className="text-sm text-muted-foreground">{NAO_VALIDADO}</div>
                        ) : (
                          <ul className="text-sm space-y-1">
                            {data.agenda_today.by_doctor!.map((d) => (
                              <li key={d.doctor} className="flex justify-between border-b border-dashed py-1">
                                <span>{d.doctor}</span>
                                <span className="font-medium">{d.total}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Rotina em {referenceDate}</CardTitle></CardHeader>
                <CardContent>
                  {data.routine_tasks?.available === false ? (
                    <div className="text-sm text-muted-foreground">{NAO_VALIDADO}</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Kpi label="Tarefas ativas" value={data.routine_tasks.total_active ?? null} />
                      <Kpi label="Execuções no escopo" value={data.routine_tasks.completions_in_scope ?? null} />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Prioridades abertas</CardTitle></CardHeader>
                <CardContent>
                  {data.open_priorities.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{NAO_VALIDADO}</div>
                  ) : (
                    <ul className="text-sm space-y-2">
                      {data.open_priorities.slice(0, 10).map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 rounded border p-2">
                          <span className="font-mono text-xs">{p.user_ref ?? NAO_VALIDADO}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">{p.status}</Badge>
                          <Badge variant={p.has_mission ? "default" : "secondary"} className="text-[10px]">
                            {p.has_mission ? "missão definida" : "sem missão"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Clientes sem interação</CardTitle></CardHeader>
                <CardContent>
                  {data.inactive_clients.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{NAO_VALIDADO}</div>
                  ) : (
                    <ul className="text-sm space-y-1 max-h-72 overflow-auto">
                      {data.inactive_clients.map((c, i) => (
                        <li key={i} className="flex justify-between border-b border-dashed py-1">
                          <span className="font-mono text-xs">{c.client_ref ?? NAO_VALIDADO}</span>
                          <span className="text-muted-foreground">
                            {c.last_activity_at ? format(new Date(c.last_activity_at), "dd/MM/yyyy", { locale: ptBR }) : NAO_VALIDADO}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Contexto GPT Maker</CardTitle></CardHeader>
              <CardContent>
                {(!data.gptmaker_context || data.gptmaker_context.length === 0) ? (
                  <div className="text-sm text-muted-foreground">{NAO_VALIDADO} — nenhum conteúdo pessoal é armazenado nesta etapa.</div>
                ) : (
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(data.gptmaker_context, null, 2)}</pre>
                )}
              </CardContent>
            </Card>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Sugestões táticas</h2>
              {data.suggestions.length === 0 ? (
                <div className="text-sm text-muted-foreground">{NAO_VALIDADO}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.suggestions.map((s) => (<SuggestionCard key={s.id} s={s} />))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Botões Aplicar/Alterar/Ignorar não executam ações externas nesta versão (PR2). Integrações chegam no PR3.
              </p>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
