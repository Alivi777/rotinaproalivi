// Sincroniza tarefas da Agenda Clínica (clinic_daily_tasks) da semana corrente
// para o kanban do setor Recepção, criando 1 card por tarefa na coluna do tipo
// (task-birthday, task-confirm-d7..d4, task-protocol-d3, task-urgency-d2, task-unbook-d1).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TASK_TYPE_TO_SLUG: Record<string, string> = {
  birthday: "task-birthday",
  confirm_d7: "task-confirm-d7",
  confirm_d6: "task-confirm-d6",
  confirm_d5: "task-confirm-d5",
  confirm_d4: "task-confirm-d4",
  protocol_d3: "task-protocol-d3",
  urgency_d2: "task-urgency-d2",
  unbook_confirm_d1: "task-unbook-d1",
};

const TASK_TYPE_LABEL: Record<string, string> = {
  birthday: "🎂 Aniversário",
  confirm_d7: "Confirmar (D-7)",
  confirm_d6: "Confirmar (D-6)",
  confirm_d5: "Confirmar (D-5)",
  confirm_d4: "Confirmar (D-4)",
  protocol_d3: "Protocolo falta confirmação (D-3)",
  urgency_d2: "Urgência/escassez (D-2)",
  unbook_confirm_d1: "Confirmação desmarque (D-1)",
};

function getWeekRangeSP(): { monday: string; saturday: string } {
  const now = new Date();
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const dow = sp.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() + diffToMon));
  const sat = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() + diffToMon + 5));
  return { monday: mon.toISOString().slice(0, 10), saturday: sat.toISOString().slice(0, 10) };
}

function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(11, 16);
}

function fmtDate(d: string): string {
  // d = YYYY-MM-DD
  const [, m, dd] = d.split("-");
  return `${dd}/${m}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { monday, saturday } = getWeekRangeSP();

    // 1) Setor Recepção
    const { data: sector, error: secErr } = await supabase
      .from("sectors")
      .select("id")
      .eq("slug", "recepcao")
      .single();
    if (secErr || !sector) throw new Error("Setor recepcao não encontrado");

    // 2) Mapa slug → stage_id
    const { data: stages } = await supabase
      .from("kanban_stages")
      .select("id, slug")
      .eq("sector_id", sector.id)
      .in("slug", Object.values(TASK_TYPE_TO_SLUG));
    const stageBySlug = new Map((stages || []).map((s) => [s.slug, s.id]));

    // 3) Tarefas da semana
    const { data: tasks, error: tErr } = await supabase
      .from("clinic_daily_tasks")
      .select("id, task_type, task_date, patient_name, patient_phone, doctor_name, appointment_at, status, notes")
      .gte("task_date", monday)
      .lte("task_date", saturday)
      .order("task_date", { ascending: true });
    if (tErr) throw tErr;

    console.log(`[tasks-to-reception] week ${monday}..${saturday}, ${tasks?.length ?? 0} tasks`);

    // 4) Buscar cards já criados nesta semana (evita duplicar a cada cron)
    //    Identificador no notes: [task:<task_id>]
    const { data: existing } = await supabase
      .from("clients")
      .select("id, notes")
      .eq("sector_id", sector.id)
      .ilike("notes", "%[task:%");
    const existingTaskIds = new Set<string>();
    for (const c of existing || []) {
      const m = String(c.notes ?? "").match(/\[task:([0-9a-f-]{36})\]/);
      if (m) existingTaskIds.add(m[1]);
    }

    // 5) Inserir cards faltantes
    let created = 0, skipped = 0, missingStage = 0;
    const rows: Array<Record<string, unknown>> = [];
    for (const t of tasks ?? []) {
      if (existingTaskIds.has(t.id)) { skipped++; continue; }
      const slug = TASK_TYPE_TO_SLUG[t.task_type];
      const stageId = slug ? stageBySlug.get(slug) : undefined;
      if (!stageId) { missingStage++; continue; }

      const time = fmtTime(t.appointment_at);
      const lines = [
        `📋 ${TASK_TYPE_LABEL[t.task_type] ?? t.task_type}`,
        `📅 ${fmtDate(t.task_date)}${time ? ` • Consulta ${time}` : ""}`,
        t.doctor_name ? `👨‍⚕️ Dr(a). ${t.doctor_name}` : null,
        t.patient_phone ? `📱 ${t.patient_phone}` : null,
        t.notes ? `\n📝 ${t.notes}` : null,
        `\n[task:${t.id}]`,
      ].filter(Boolean).join("\n");

      rows.push({
        name: t.patient_name,
        phone: t.patient_phone,
        notes: lines,
        sector_id: sector.id,
        stage_id: stageId,
        board_position: 0,
      });
    }

    const batchSize = 200;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const { error: insErr } = await supabase.from("clients").insert(slice);
      if (insErr) {
        console.error("insert err:", insErr.message);
      } else {
        created += slice.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        week: { monday, saturday },
        tasks: tasks?.length ?? 0,
        cards_created: created,
        skipped_existing: skipped,
        missing_stage: missingStage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("clinic-tasks-to-reception error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
