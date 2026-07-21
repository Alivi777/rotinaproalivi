import { describe, it, expect } from "vitest";
import {
  buildExportPayload,
  buildExportCsv,
  compareKpis,
  collectCategories,
  collectDoctors,
  DEFAULT_FILTERS,
  exportCsvFilename,
  exportFilename,
  filterDoctors,
  filterPriorities,
  filterSuggestions,
  passesStatus,
} from "./resumoDiario";
import type { DailySummary } from "@/hooks/useTacticalDailySummary";

const base: DailySummary = {
  status: "PASS",
  mode: "draft",
  reference_date: "2026-05-10",
  agenda_date: "2026-05-11",
  timezone: "America/Sao_Paulo",
  scope: "sector",
  data_quality: [],
  company_kpis: { month_to_date: { revenue: 1000, profit: 200, new_patients: 5, sample_size: 20 } },
  agenda_today: {
    available: true,
    total: 3,
    completed: 1,
    by_doctor: [
      { doctor: "Dra. Wanessa", total: 2 },
      { doctor: "Dr. Davi", total: 1 },
    ],
  },
  routine_tasks: { available: true, total_active: 4, completions_in_scope: 2 },
  open_priorities: [
    { id: "p1", user_ref: "u_abc", status: "open", has_mission: true },
    { id: "p2", user_ref: "u_xyz", status: "blocked", has_mission: false },
  ],
  inactive_clients: [],
  gptmaker_context: [],
  suggestions: [
    { id: "s1", category: "agenda", priority: "high", text: "Confirmar consultas", source_record_ids: [], data_used: {}, requires_approval: false, suggested_action: "notificar" },
    { id: "s2", category: "rotina", priority: "low", text: "Revisar rotina", source_record_ids: [], data_used: {}, requires_approval: false, suggested_action: "revisar" },
  ],
  sources: ["clinicorp"],
};

describe("resumoDiario helpers", () => {
  it("collects doctors and categories", () => {
    expect(collectDoctors(base)).toEqual(["Dr. Davi", "Dra. Wanessa"]);
    expect(collectCategories(base)).toEqual(["agenda", "rotina"]);
  });

  it("filters by doctor and query", () => {
    expect(filterDoctors(base, { ...DEFAULT_FILTERS, doctor: "Dr. Davi" })).toHaveLength(1);
    expect(filterDoctors(base, { ...DEFAULT_FILTERS, query: "wanessa" })).toHaveLength(1);
  });

  it("filters suggestions by category and text", () => {
    expect(filterSuggestions(base, { ...DEFAULT_FILTERS, category: "agenda" })).toHaveLength(1);
    expect(filterSuggestions(base, { ...DEFAULT_FILTERS, query: "rotina" })).toHaveLength(1);
  });

  it("filters priorities by query", () => {
    expect(filterPriorities(base, { ...DEFAULT_FILTERS, query: "blocked" })).toHaveLength(1);
  });

  it("filters by status", () => {
    expect(passesStatus(base, { ...DEFAULT_FILTERS, status: "PASS" })).toBe(true);
    expect(passesStatus(base, { ...DEFAULT_FILTERS, status: "BLOCKED" })).toBe(false);
  });

  it("compares KPIs between two summaries with deltas", () => {
    const b: DailySummary = {
      ...base,
      company_kpis: { month_to_date: { revenue: 1500, profit: 200, new_patients: null, sample_size: 25 } },
    };
    const diff = compareKpis(base, b);
    const revenue = diff.find((d) => d.key === "revenue")!;
    expect(revenue.delta).toBe(500);
    const patients = diff.find((d) => d.key === "new_patients")!;
    expect(patients.delta).toBeNull();
  });

  it("returns null deltas when data missing", () => {
    const diff = compareKpis(null, base);
    expect(diff.every((d) => d.a === null)).toBe(true);
    expect(diff.every((d) => d.delta === null)).toBe(true);
  });

  it("builds export payload with metadata and no credentials", () => {
    const payload = buildExportPayload(base, { generated_at: "2026-05-11T12:00:00Z", source: "tactical-daily-summary" }) as any;
    expect(payload.metadata.period).toEqual({ reference_date: "2026-05-10", agenda_date: "2026-05-11" });
    expect(payload.metadata.timezone).toBe("America/Sao_Paulo");
    expect(payload.metadata.generated_at).toBe("2026-05-11T12:00:00Z");
    const s = JSON.stringify(payload).toLowerCase();
    expect(s.includes("authorization")).toBe(false);
    expect(s.includes("token")).toBe(false);
    expect(s.includes("prompt")).toBe(false);
    expect(s.includes("apikey")).toBe(false);
  });

  it("export filename encodes both dates", () => {
    expect(exportFilename("2026-05-10", "2026-05-11")).toBe("resumo-diario_2026-05-10_2026-05-11.json");
    expect(exportCsvFilename("2026-05-10", "2026-05-11")).toBe("resumo-diario_2026-05-10_2026-05-11.csv");
  });

  it("builds CSV export with masked IDs and metadata, no credentials", () => {
    const csv = buildExportCsv(base, { generated_at: "2026-05-11T12:00:00Z", source: "tactical-daily-summary" });
    expect(csv).toContain("reference_date;2026-05-10");
    expect(csv).toContain("agenda_date;2026-05-11");
    expect(csv).toContain("timezone;America/Sao_Paulo");
    expect(csv).toContain("## kpis_month_to_date");
    expect(csv).toContain("Dra. Wanessa;2");
    expect(csv).toContain("u_abc");
    const lower = csv.toLowerCase();
    expect(lower.includes("authorization")).toBe(false);
    expect(lower.includes("apikey")).toBe(false);
    expect(lower.includes("prompt")).toBe(false);
  });
});
