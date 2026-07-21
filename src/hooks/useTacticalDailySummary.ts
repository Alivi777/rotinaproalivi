import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SummaryStatus = "PASS" | "PARTIAL" | "BLOCKED";
export type SummaryScope = "self" | "sector" | "global";

export interface AgendaByDoctor {
  doctor: string;
  total: number;
}

export interface AgendaToday {
  available?: boolean;
  reason?: string;
  date?: string;
  total?: number;
  completed?: number | null;
  by_doctor?: AgendaByDoctor[];
}

export interface RoutineTasksBlock {
  available?: boolean;
  date?: string;
  total_active?: number | null;
  completions_in_scope?: number | null;
}

export interface OpenPriority {
  id: string;
  user_ref: string | null;
  status: string;
  has_mission: boolean;
}

export interface InactiveClient {
  client_ref: string | null;
  last_activity_at: string | null;
}

export interface Suggestion {
  id: string;
  category: string;
  priority: "low" | "medium" | "high" | string;
  text: string;
  source_record_ids: string[];
  data_used: Record<string, unknown>;
  requires_approval: boolean;
  suggested_action: string;
}

export interface DailySummary {
  status: SummaryStatus;
  mode: "draft" | "final";
  reference_date: string;
  agenda_date: string;
  timezone: string;
  scope: SummaryScope;
  data_quality: string[];
  company_kpis: Record<string, any>;
  agenda_today: AgendaToday;
  routine_tasks: RoutineTasksBlock;
  open_priorities: OpenPriority[];
  inactive_clients: InactiveClient[];
  gptmaker_context: unknown[];
  suggestions: Suggestion[];
  sources: string[];
}

export interface UseDailySummaryInput {
  referenceDate: string;
  agendaDate: string;
  timezone?: string;
  mode?: "draft" | "final";
  enabled?: boolean;
}

export class DailySummaryError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function yesterdayInSaoPaulo(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export function useTacticalDailySummary(input: UseDailySummaryInput) {
  const { referenceDate, agendaDate, timezone = "America/Sao_Paulo", mode = "draft", enabled = true } = input;

  return useQuery<DailySummary, DailySummaryError>({
    queryKey: ["tactical-daily-summary", referenceDate, agendaDate, timezone, mode],
    enabled,
    retry: (failureCount, error) => {
      if (error instanceof DailySummaryError && (error.status === 401 || error.status === 403)) return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<DailySummary>("tactical-daily-summary", {
        body: { reference_date: referenceDate, agenda_date: agendaDate, timezone, mode },
      });
      if (error) {
        // supabase FunctionsHttpError carries context
        const ctx: any = (error as any).context;
        const status = ctx?.status ?? (error as any).status ?? 500;
        let msg = error.message || "Erro ao carregar resumo diário";
        try {
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* ignore */ }
        throw new DailySummaryError(msg, status);
      }
      if (!data) throw new DailySummaryError("Resposta vazia", 500);
      return data;
    },
  });
}
