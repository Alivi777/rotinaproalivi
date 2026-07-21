import type {
  DailySummary,
  OpenPriority,
  Suggestion,
  SummaryStatus,
} from "@/hooks/useTacticalDailySummary";

export interface SummaryFilters {
  query: string;
  doctor: string; // "all" or doctor name
  category: string; // "all" or category
  status: SummaryStatus | "all";
}

export const DEFAULT_FILTERS: SummaryFilters = {
  query: "",
  doctor: "all",
  category: "all",
  status: "all",
};

export function collectDoctors(s: DailySummary | undefined | null): string[] {
  if (!s?.agenda_today?.by_doctor) return [];
  return [...new Set(s.agenda_today.by_doctor.map((d) => d.doctor).filter(Boolean))].sort();
}

export function collectCategories(s: DailySummary | undefined | null): string[] {
  if (!s?.suggestions) return [];
  return [...new Set(s.suggestions.map((x) => x.category).filter(Boolean))].sort();
}

export function passesStatus(s: DailySummary, f: SummaryFilters): boolean {
  return f.status === "all" || s.status === f.status;
}

export function filterDoctors(s: DailySummary, f: SummaryFilters) {
  const list = s.agenda_today?.by_doctor ?? [];
  const q = f.query.trim().toLowerCase();
  return list.filter((d) => {
    if (f.doctor !== "all" && d.doctor !== f.doctor) return false;
    if (q && !d.doctor.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function filterSuggestions(s: DailySummary, f: SummaryFilters): Suggestion[] {
  const q = f.query.trim().toLowerCase();
  return s.suggestions.filter((x) => {
    if (f.category !== "all" && x.category !== f.category) return false;
    if (q) {
      const hay = `${x.text} ${x.category} ${x.suggested_action}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function filterPriorities(s: DailySummary, f: SummaryFilters): OpenPriority[] {
  const q = f.query.trim().toLowerCase();
  return s.open_priorities.filter((p) => {
    if (!q) return true;
    return `${p.status} ${p.user_ref ?? ""}`.toLowerCase().includes(q);
  });
}

export interface KpiDelta {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
  delta: number | null;
}

const KPI_KEYS: { key: string; label: string }[] = [
  { key: "revenue", label: "Receita MTD" },
  { key: "profit", label: "Lucro MTD" },
  { key: "new_patients", label: "Novos pacientes" },
  { key: "sample_size", label: "Vendas registradas" },
];

function readKpi(s: DailySummary | undefined | null, key: string): number | null {
  const mtd: any = (s?.company_kpis as any)?.month_to_date;
  if (!mtd) return null;
  const v = mtd[key];
  return v === null || v === undefined ? null : Number(v);
}

export function compareKpis(a: DailySummary | null | undefined, b: DailySummary | null | undefined): KpiDelta[] {
  return KPI_KEYS.map(({ key, label }) => {
    const av = readKpi(a, key);
    const bv = readKpi(b, key);
    const delta = av !== null && bv !== null ? bv - av : null;
    return { key, label, a: av, b: bv, delta };
  });
}

/**
 * Build a privacy-preserving JSON export.
 * - Strips any client-side additions
 * - Only serializes fields the edge function already returned (already masked)
 * - Adds metadata (period, timezone, generated_at) but never tokens/headers/prompts.
 */
export function buildExportPayload(
  summary: DailySummary,
  meta: { generated_at: string; source: string },
): Record<string, unknown> {
  const {
    status,
    mode,
    reference_date,
    agenda_date,
    timezone,
    scope,
    data_quality,
    company_kpis,
    agenda_today,
    routine_tasks,
    open_priorities,
    inactive_clients,
    gptmaker_context,
    suggestions,
    sources,
  } = summary;

  return {
    metadata: {
      generated_at: meta.generated_at,
      source: meta.source,
      period: { reference_date, agenda_date },
      timezone,
      scope,
      status,
      mode,
      privacy_note: "IDs mascarados; nenhum token, header, prompt ou credencial incluído.",
    },
    data_quality,
    company_kpis,
    agenda_today,
    routine_tasks,
    open_priorities,
    inactive_clients,
    gptmaker_context,
    suggestions,
    sources,
  };
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportFilename(reference_date: string, agenda_date: string): string {
  return `resumo-diario_${reference_date}_${agenda_date}.json`;
}
