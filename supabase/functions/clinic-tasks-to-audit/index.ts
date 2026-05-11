// Sincroniza cards de Auditoria a partir de clinic_appointments:
//   1) NPS de hoje  → 1 card por paciente atendido hoje (2 itens)
//   2) Conferir agenda amanhã → 1 card por paciente com consulta amanhã (4 itens)
//
// Idempotente: limpa cards anteriores marcados com [audit:...] no notes (exceto Concluído)
// e regera. Roda em background pra evitar timeout.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NPS_ITEMS = [
  { type: "nps_send",    label: "📩 Enviar pesquisa NPS",     howto: "Envie a pesquisa NPS pelo WhatsApp logo após o atendimento." },
  { type: "nps_record",  label: "📝 Registrar nota recebida", howto: "Aguarde resposta e registre a nota dada (0–10) no card." },
];

const DOC_ITEMS = [
  { type: "doc_contract", label: "📄 Conferir contrato assinado", howto: "Verifique se o contrato está assinado pelo paciente." },
  { type: "doc_rg",       label: "🪪 Conferir RG/CPF",            howto: "Confirme se RG e CPF estão anexados no prontuário." },
  { type: "doc_anamnese", label: "📋 Conferir anamnese",          howto: "Anamnese preenchida e assinada deve estar no prontuário." },
  { type: "doc_photo",    label: "📸 Conferir foto inicial",      howto: "Foto inicial do caso deve estar registrada antes do atendimento." },
];

function spDateKey(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(11, 16);
}
function fmtDate(d: string): string {
  const [, m, dd] = d.split("-");
  return `${dd}/${m}`;
}

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

type Appt = {
  id: string;
  patient_name: string;
  patient_phone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  appointment_at: string;
};

async function runSync(supabase: ReturnType<typeof createClient>) {
  const nowSp = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const todayKey = spDateKey(new Date());
  const tomorrowKey = spDateKey(new Date(nowSp.getTime() + 24 * 60 * 60 * 1000));
  console.log(`[audit:bg] start today=${todayKey} tomorrow=${tomorrowKey}`);

  // Setor + colunas
  const { data: sector, error: secErr } = await supabase
    .from("sectors").select("id").eq("slug", "auditoria").single();
  if (secErr || !sector) throw new Error("Setor auditoria não encontrado");

  const { data: stages } = await supabase
    .from("kanban_stages").select("id, slug").eq("sector_id", sector.id);
  const stageBy = new Map((stages ?? []).map((s) => [s.slug, s.id]));
  const npsStage = stageBy.get("audit-nps-today");
  const docStage = stageBy.get("audit-docs-tomorrow");
  const doneStage = stageBy.get("audit-done");
  if (!npsStage || !docStage) throw new Error("Stages auditoria ausentes");

  // Doutores p/ cor
  const { data: docs } = await supabase
    .from("clinic_doctors").select("id, name, color, assigned_user_id");
  const docById = new Map((docs ?? []).map((d) => [d.id, d]));

  // Buscar appointments de hoje (NPS) e amanhã (DOC)
  const startToday = `${todayKey}T00:00:00-03:00`;
  const endToday = `${todayKey}T23:59:59-03:00`;
  const startTom = `${tomorrowKey}T00:00:00-03:00`;
  const endTom = `${tomorrowKey}T23:59:59-03:00`;

  const [npsRes, docRes] = await Promise.all([
    supabase.from("clinic_appointments")
      .select("id, patient_name, patient_phone, doctor_id, doctor_name, appointment_at")
      .gte("appointment_at", startToday).lte("appointment_at", endToday)
      .order("appointment_at"),
    supabase.from("clinic_appointments")
      .select("id, patient_name, patient_phone, doctor_id, doctor_name, appointment_at")
      .gte("appointment_at", startTom).lte("appointment_at", endTom)
      .order("appointment_at"),
  ]);
  const npsAppts = (npsRes.data ?? []) as Appt[];
  const docAppts = (docRes.data ?? []) as Appt[];
  console.log(`[audit] nps=${npsAppts.length} doc=${docAppts.length}`);

  // Limpar cards anteriores (com [audit:...] e não Concluído)
  const DEL_BATCH = 100;
  while (true) {
    const { data: oldCards } = await supabase
      .from("clients").select("id")
      .eq("sector_id", sector.id)
      .like("notes", "%[audit:%")
      .neq("stage_id", doneStage ?? "00000000-0000-0000-0000-000000000000")
      .limit(1000);
    const ids = (oldCards ?? []).map((c) => c.id);
    if (ids.length === 0) break;
    for (let i = 0; i < ids.length; i += DEL_BATCH) {
      const chunk = ids.slice(i, i + DEL_BATCH);
      await supabase.from("client_task_items").delete().in("client_id", chunk);
      await supabase.from("clients").delete().in("id", chunk);
    }
    if (ids.length < 1000) break;
  }

  // Dedup por paciente+dia (1 card por paciente)
  type Group = { key: string; appt: Appt; date: string; kind: "nps" | "doc" };
  const groups: Group[] = [];
  const seen = new Set<string>();

  for (const a of npsAppts) {
    const key = `nps|${(a.patient_phone ?? "").replace(/\D/g, "") || a.patient_name}|${todayKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ key, appt: a, date: todayKey, kind: "nps" });
  }
  for (const a of docAppts) {
    const key = `doc|${(a.patient_phone ?? "").replace(/\D/g, "") || a.patient_name}|${tomorrowKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ key, appt: a, date: tomorrowKey, kind: "doc" });
  }

  // Inserir clients em lotes
  const BATCH = 200;
  let cardsCreated = 0;
  let itemsCreated = 0;

  for (let i = 0; i < groups.length; i += BATCH) {
    const slice = groups.slice(i, i + BATCH);
    const rows = slice.map((g) => {
      const doc = g.appt.doctor_id ? docById.get(g.appt.doctor_id) : undefined;
      const docName = g.appt.doctor_name ?? doc?.name ?? "";
      const docColor = doc?.color ?? "";
      const time = fmtTime(g.appt.appointment_at);
      const kindLabel = g.kind === "nps" ? "NPS" : "Conferir documentação";
      const lines = [
        `[audit:${g.kind}]`,
        ...(docName ? [`[doctor:${docName}|${docColor}]`] : []),
        `📅 ${fmtDate(g.date)}${time ? ` • ${time}` : ""} — ${kindLabel}`,
        ...(docName ? [`👨‍⚕️ Dr(a). ${docName}`] : []),
        ...(g.appt.patient_phone ? [`📱 ${g.appt.patient_phone}`] : []),
        "",
        `[task_date:${g.date}]`,
        `[appt:${g.appt.appointment_at}]`,
      ];
      return {
        name: g.appt.patient_name,
        phone: g.appt.patient_phone,
        notes: lines.join("\n"),
        sector_id: sector.id,
        stage_id: g.kind === "nps" ? npsStage : docStage,
        assigned_to: doc?.assigned_user_id ?? null,
        board_position: 0,
      };
    });

    const { data: inserted, error: insErr } = await supabase
      .from("clients").insert(rows).select("id");
    if (insErr || !inserted) { console.error("insert err:", insErr?.message); continue; }
    cardsCreated += inserted.length;

    const itemsBatch: Array<Record<string, unknown>> = [];
    inserted.forEach((row, idx) => {
      const g = slice[idx];
      const items = g.kind === "nps" ? NPS_ITEMS : DOC_ITEMS;
      items.forEach((it, k) => {
        itemsBatch.push({
          client_id: row.id,
          task_type: it.type,
          task_label: it.label,
          task_howto: it.howto,
          task_date: g.date,
          status: "pending",
          sort_order: k,
        });
      });
    });
    for (let j = 0; j < itemsBatch.length; j += 500) {
      const chunk = itemsBatch.slice(j, j + 500);
      const { error } = await supabase.from("client_task_items").insert(chunk);
      if (error) console.error("items err:", error.message);
      else itemsCreated += chunk.length;
    }
  }

  console.log(`[audit:bg] DONE cards=${cardsCreated} items=${itemsCreated}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Authorize: cron secret OR authenticated user
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  const isCron = cronSecret && providedSecret && providedSecret === cronSecret;
  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !data?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Require admin role (service-role bypasses RLS on user_roles)
    const adminCheck = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleRow } = await adminCheck
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const job = runSync(supabase).catch((e) => {
    console.error("[audit:bg] FAIL:", e instanceof Error ? e.message : String(e));
  });
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(job);
  }
  return new Response(
    JSON.stringify({ success: true, queued: true, message: "Auditoria iniciada em background. Aguarde ~15s." }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
