// Edge function: tactical-daily-summary
// PR1 — Fase 1 Inteligência Diária. Retorno estruturado, sem escrita, com
// controle de acesso (colaborador/gestor/admin) e minimização de dados
// antes da chamada à IA. Não cria tarefas, não altera Clinicorp, não envia
// mensagens. Ausência de dados é reportada em data_quality — nunca zero.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Scope = "self" | "sector" | "global";
type Input = {
  reference_date?: string;
  agenda_date?: string;
  timezone?: string;
  mode?: "draft" | "final";
};

const isoDate = (d: Date, tz = "America/Sao_Paulo") =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const mask = async (v: string | null | undefined) =>
  v ? `id_${(await sha256Hex(v)).slice(0, 10)}` : null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const startedAt = Date.now();
  const dataQuality: string[] = [];
  const sources: string[] = [];

  try {
    // === Auth ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user?.id) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // === Input ===
    let body: Input = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const tz = body.timezone ?? "America/Sao_Paulo";
    const referenceDate = body.reference_date ?? isoDate(new Date(), tz);
    const agendaDate = body.agenda_date ?? referenceDate;
    const mode = body.mode ?? "draft";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(agendaDate)) {
      return json({ error: "reference_date/agenda_date inválidos (YYYY-MM-DD)" }, 400);
    }

    // === Scope resolution ===
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roles = new Set((roleRows ?? []).map((r: any) => r.role));
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, display_name, sector_id")
      .eq("user_id", userId)
      .maybeSingle();

    let scope: Scope = "self";
    if (roles.has("admin")) scope = "global";
    else if (roles.has("moderator")) scope = "sector";

    // Peers in scope (user_ids visible)
    let peerIds: string[] = [userId];
    if (scope === "sector" && profile?.sector_id) {
      const { data } = await admin.from("profiles").select("user_id").eq("sector_id", profile.sector_id).eq("is_active", true);
      peerIds = (data ?? []).map((p: any) => p.user_id);
    } else if (scope === "global") {
      const { data } = await admin.from("profiles").select("user_id").eq("is_active", true);
      peerIds = (data ?? []).map((p: any) => p.user_id);
    }

    // === Data gathering ===
    sources.push("profiles", "user_roles");

    // Agenda do dia (clinic_daily_tasks preferido; fallback clinic_appointments)
    let agendaTotal: number | null = null;
    let agendaDone: number | null = null;
    let agendaByDoctor: Array<{ doctor: string; total: number }> = [];
    const { data: dailyTasks, error: dtErr } = await admin
      .from("clinic_daily_tasks")
      .select("id, doctor_external_id, doctor_name, status, task_date")
      .eq("task_date", agendaDate);
    if (dtErr) dataQuality.push("clinic_daily_tasks: erro na leitura");
    else if (dailyTasks && dailyTasks.length > 0) {
      sources.push("clinic_daily_tasks");
      agendaTotal = dailyTasks.length;
      agendaDone = dailyTasks.filter((t: any) => t.status === "completed" || t.status === "done").length;
      const map = new Map<string, number>();
      for (const t of dailyTasks as any[]) {
        const key = t.doctor_name || t.doctor_external_id || "sem_profissional";
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      agendaByDoctor = Array.from(map.entries()).map(([doctor, total]) => ({ doctor, total }));
    } else {
      dataQuality.push(`clinic_daily_tasks: nenhum registro em ${agendaDate}`);
    }

    // Rotina no reference_date
    const { data: routineActive } = await admin.from("routine_tasks").select("id").eq("active", true);
    const routineTotal = routineActive?.length ?? null;
    const { data: completions, error: compErr } = await admin
      .from("task_completions")
      .select("task_id, user_id, completion_date")
      .eq("completion_date", referenceDate)
      .in("user_id", peerIds);
    if (compErr) dataQuality.push("task_completions: erro na leitura");
    else sources.push("task_completions", "routine_tasks");
    const routineDone = completions?.length ?? null;

    // Prioridades abertas (do dia, escopo)
    const { data: priorities, error: prErr } = await admin
      .from("daily_priorities")
      .select("id, user_id, priority_date, status, mission_main")
      .eq("priority_date", referenceDate)
      .in("user_id", peerIds);
    if (prErr) dataQuality.push("daily_priorities: erro na leitura");
    else sources.push("daily_priorities");
    const openPrioritiesRaw = (priorities ?? []).filter((p: any) => p.status !== "completed");

    // Clientes sem interação (via clients.updated_at, escopo por assigned_to)
    let inactiveClientsRaw: any[] = [];
    {
      let q = admin
        .from("clients")
        .select("id, updated_at, assigned_to")
        .order("updated_at", { ascending: true })
        .limit(50);
      if (scope !== "global") q = q.in("assigned_to", peerIds);
      const { data, error } = await q;
      if (error) dataQuality.push("clients: erro na leitura");
      else {
        sources.push("clients");
        inactiveClientsRaw = data ?? [];
      }
    }

    // KPIs de vendas do mês (só admin/gestor)
    let companyKpis: Record<string, unknown> = {};
    if (scope === "global" || scope === "sector") {
      const monthStart = `${referenceDate.slice(0, 7)}-01`;
      const { data: sales, error: sErr } = await admin
        .from("sales")
        .select("amount, profit, is_new_patient, created_by")
        .gte("sale_date", monthStart)
        .lte("sale_date", referenceDate)
        .in("created_by", peerIds);
      if (sErr) dataQuality.push("sales: erro na leitura");
      else {
        sources.push("sales");
        companyKpis = {
          month_to_date: {
            revenue: sales?.reduce((a: number, s: any) => a + Number(s.amount || 0), 0) ?? null,
            profit: sales?.reduce((a: number, s: any) => a + Number(s.profit || 0), 0) ?? null,
            new_patients: sales?.filter((s: any) => s.is_new_patient).length ?? null,
            sample_size: sales?.length ?? 0,
          },
        };
      }
    } else {
      companyKpis = { note: "KPIs corporativos não disponíveis para o papel do usuário" };
    }

    // Mascaramento
    const inactiveClients = await Promise.all(
      inactiveClientsRaw.map(async (c: any) => ({
        client_ref: await mask(c.id),
        last_activity_at: c.updated_at,
      }))
    );
    const openPriorities = await Promise.all(
      openPrioritiesRaw.map(async (p: any) => ({
        id: p.id,
        user_ref: await mask(p.user_id),
        status: p.status,
        has_mission: !!p.mission_main,
      }))
    );

    const agendaToday = agendaTotal === null
      ? { available: false, reason: `sem dados em ${agendaDate}` }
      : { date: agendaDate, total: agendaTotal, completed: agendaDone, by_doctor: agendaByDoctor };

    const routineTasks = routineTotal === null || routineDone === null
      ? { available: false }
      : { date: referenceDate, total_active: routineTotal, completions_in_scope: routineDone };

    // === Minimized context to AI ===
    const aiContext = {
      reference_date: referenceDate,
      agenda_date: agendaDate,
      scope,
      agenda_today: agendaToday,
      routine_tasks: routineTasks,
      open_priorities_count: openPriorities.length,
      inactive_clients_count: inactiveClients.length,
      company_kpis: companyKpis,
      data_quality: dataQuality,
    };
    const inputHash = await sha256Hex(JSON.stringify(aiContext));

    // === AI suggestions ===
    let suggestions: any[] = [];
    let aiStatus: "PASS" | "PARTIAL" | "BLOCKED" = "PASS";
    let aiError: string | null = null;
    let tokenUsage: any = null;

    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "Você é um copiloto tático de clínica. Gere sugestões operacionais objetivas em pt-BR baseadas APENAS no contexto agregado fornecido. Nunca decida advertência, bônus, promoção ou desligamento. Nunca invente números. Retorne JSON válido no schema pedido.",
            },
            {
              role: "user",
              content: `Contexto agregado (sem dados pessoais):\n${JSON.stringify(aiContext)}\n\nRetorne JSON: {"suggestions":[{"id":"s1","category":"agenda|rotina|prioridade|cliente|kpi","priority":"low|medium|high","text":"...","action":"revisar|contatar|reorganizar|monitorar","requires_approval":true}]}. Máximo 6 sugestões.`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) {
        aiError = `AI gateway status ${resp.status}`;
        aiStatus = "PARTIAL";
        if (resp.status === 429 || resp.status === 402) aiStatus = "BLOCKED";
      } else {
        const data = await resp.json();
        tokenUsage = data.usage ?? null;
        const raw = data.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw);
        suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
        suggestions = suggestions.slice(0, 6).map((s: any, idx: number) => ({
          id: s.id ?? `s${idx + 1}`,
          category: s.category ?? "geral",
          priority: s.priority ?? "medium",
          text: String(s.text ?? "").slice(0, 500),
          source_record_ids: [],
          data_used: { reference_date: referenceDate, agenda_date: agendaDate, scope },
          requires_approval: s.requires_approval !== false,
          suggested_action: s.action ?? "revisar",
        }));
        sources.push("lovable_ai_gateway");
      }
    } catch (e: any) {
      aiError = e?.message ?? String(e);
      aiStatus = "PARTIAL";
    }
    if (dataQuality.length > 0 && aiStatus === "PASS") aiStatus = "PARTIAL";

    const output = {
      status: aiStatus,
      mode,
      reference_date: referenceDate,
      agenda_date: agendaDate,
      timezone: tz,
      scope,
      data_quality: dataQuality,
      company_kpis: companyKpis,
      agenda_today: agendaToday,
      routine_tasks: routineTasks,
      open_priorities: openPriorities,
      inactive_clients: inactiveClients,
      gptmaker_context: [], // Reservado; conteúdo pessoal não é armazenado aqui.
      suggestions,
      sources,
    };
    const outputHash = await sha256Hex(JSON.stringify(output));

    // Log técnico apenas — sem prompt/resposta com dados pessoais
    console.log(JSON.stringify({
      evt: "tactical-daily-summary",
      user_ref: (await mask(userId)),
      scope,
      status: aiStatus,
      duration_ms: Date.now() - startedAt,
      sources_count: sources.length,
      records: {
        agenda: agendaTotal, routine_active: routineTotal, routine_done: routineDone,
        priorities_open: openPriorities.length, inactive: inactiveClients.length,
      },
      data_quality_count: dataQuality.length,
      ai_error: aiError,
      usage: tokenUsage,
      input_hash: inputHash,
      output_hash: outputHash,
    }));

    return json(output);
  } catch (e: any) {
    console.error(JSON.stringify({
      evt: "tactical-daily-summary.error",
      duration_ms: Date.now() - startedAt,
      error: e?.message ?? String(e),
    }));
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
});
