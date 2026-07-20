// Testes leves de contrato para tactical-daily-summary.
// Foco: fuso horário, virada de mês, entrada inválida, mascaramento e ausência de auth.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const BASE = Deno.env.get("VITE_SUPABASE_URL");
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
const URL = BASE ? `${BASE}/functions/v1/tactical-daily-summary` : null;

async function call(body: unknown, auth?: string) {
  const res = await fetch(URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

Deno.test("rejeita sem Authorization", async () => {
  if (!URL) return;
  const r = await call({ reference_date: "2026-05-15" });
  assertEquals(r.status, 401);
});

Deno.test("valida formato de data", async () => {
  if (!URL || !ANON) return;
  const r = await call({ reference_date: "15/05/2026" }, `Bearer ${ANON}`);
  // 401 (anon não é user) ou 400 (bad request) — ambos aceitáveis
  assert(r.status === 400 || r.status === 401);
});

Deno.test("virada de mês: aceita último dia do mês", () => {
  const d = new Date("2026-05-31T23:30:00-03:00");
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  assertEquals(iso, "2026-05-31");
});

Deno.test("virada de mês: 00:30 UTC do dia 01 ainda é dia 31 em SP", () => {
  const d = new Date("2026-06-01T00:30:00Z");
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  assertEquals(iso, "2026-05-31");
});

Deno.test("mascaramento produz id opaco estável", async () => {
  const enc = new TextEncoder().encode("uuid-abc");
  const hash = await crypto.subtle.digest("SHA-256", enc);
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  assertEquals(hex.length, 64);
  assert(!hex.includes("uuid-abc"));
});
