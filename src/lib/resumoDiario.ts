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
      privacy_note: "IDs mascarados; sem dados sensíveis.",
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
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
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

export function exportCsvFilename(reference_date: string, agenda_date: string): string {
  return `resumo-diario_${reference_date}_${agenda_date}.csv`;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(";")).join("\r\n");
}

/**
 * Build a CSV export with the same metadata guarantees as the JSON export:
 * masked IDs, period, timezone, scope, generated_at. No credentials, tokens or prompts.
 * Sections are stacked with a header row per section for spreadsheet friendliness.
 */
export function buildExportCsv(
  summary: DailySummary,
  meta: { generated_at: string; source: string },
): string {
  const lines: (string | number | null | undefined)[][] = [];
  lines.push(["# resumo-diario"]);
  lines.push(["generated_at", meta.generated_at]);
  lines.push(["source", meta.source]);
  lines.push(["reference_date", summary.reference_date]);
  lines.push(["agenda_date", summary.agenda_date]);
  lines.push(["timezone", summary.timezone]);
  lines.push(["scope", summary.scope]);
  lines.push(["status", summary.status]);
  lines.push(["mode", summary.mode]);
  lines.push(["privacy_note", "IDs mascarados; sem dados sensíveis."]);
  lines.push([]);

  const mtd: any = (summary.company_kpis as any)?.month_to_date;
  lines.push(["## kpis_month_to_date"]);
  lines.push(["metric", "value"]);
  if (mtd) {
    lines.push(["revenue", mtd.revenue ?? ""]);
    lines.push(["profit", mtd.profit ?? ""]);
    lines.push(["new_patients", mtd.new_patients ?? ""]);
    lines.push(["sample_size", mtd.sample_size ?? ""]);
  }
  lines.push([]);

  lines.push(["## agenda_by_doctor"]);
  lines.push(["doctor", "total"]);
  for (const d of summary.agenda_today?.by_doctor ?? []) {
    lines.push([d.doctor, d.total]);
  }
  lines.push([]);

  lines.push(["## open_priorities"]);
  lines.push(["id", "user_ref", "status", "has_mission"]);
  for (const p of summary.open_priorities) {
    lines.push([p.id, p.user_ref ?? "", p.status, p.has_mission ? "true" : "false"]);
  }
  lines.push([]);

  lines.push(["## inactive_clients"]);
  lines.push(["client_ref", "last_activity_at"]);
  for (const c of summary.inactive_clients) {
    lines.push([c.client_ref ?? "", c.last_activity_at ?? ""]);
  }
  lines.push([]);

  lines.push(["## suggestions"]);
  lines.push(["id", "category", "priority", "requires_approval", "suggested_action", "text"]);
  for (const s of summary.suggestions) {
    lines.push([s.id, s.category, s.priority, s.requires_approval ? "true" : "false", s.suggested_action, s.text]);
  }
  lines.push([]);

  lines.push(["## data_quality"]);
  for (const d of summary.data_quality) lines.push([d]);
  lines.push([]);

  lines.push(["## sources"]);
  for (const s of summary.sources) lines.push([s]);

  return rowsToCsv(lines);
}

export function downloadCsv(filename: string, csv: string) {
  // BOM for Excel to detect UTF-8
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename);
}
