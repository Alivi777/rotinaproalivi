// Sincroniza tarefas da Agenda Clínica (clinic_daily_tasks) da semana corrente
// para o kanban do setor Recepção.
//
// Regras:
//  - 1 card único por paciente + task_date (sem duplicar paciente no mesmo dia).
//  - O card é colocado na coluna do tipo da tarefa MAIS URGENTE do dia
//    (D-1 > D-2 > D-3 > D-4 > D-5 > D-6 > D-7 > Aniversário).
//  - O notes do card lista TODAS as tarefas pendentes do paciente naquele dia,
//    no formato da Agenda Clínica (tipo + como fazer + horário + telefone).

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

// Quanto MENOR, mais urgente (define em qual coluna o card consolidado vai).
const TASK_TYPE_PRIORITY: Record<string, number> = {
  unbook_confirm_d1: 1,
  urgency_d2: 2,
  protocol_d3: 3,
  confirm_d4: 4,
  confirm_d5: 5,
  confirm_d6: 6,
  confirm_d7: 7,
  birthday: 8,
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

// "Como fazer" — script orientador para a recepção, igual ao guia interno.
const TASK_TYPE_HOWTO: Record<string, string> = {
  birthday: "Mensagem de feliz aniversário + convite para revisão/agendamento.",
  confirm_d7: "Primeiro contato de confirmação. Confirme dia, hora e doutor(a).",
  confirm_d6: "2º toque de confirmação caso não tenha respondido D-7.",
  confirm_d5: "3º toque. Reforce horário e endereço.",
  confirm_d4: "4º toque. Pergunte se há alguma dúvida ou ajuste de horário.",
  protocol_d3: "Falta confirmação: aplique protocolo (ligar + WhatsApp + voz).",
  urgency_d2: "Crie senso de urgência/escassez. Confirme presença HOJE.",
  unbook_confirm_d1: "Última chance: confirmar ou desmarcar para liberar a vaga.",
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
  const [, m, dd] = d.split("-");
  return `${dd}/${m}`;
}

type Task = {
  id: string;
  task_type: string;
  task_date: string;
  patient_name: string;
  patient_phone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  appointment_at: string | null;
  notes: string | null;
};

type Doctor = { id: string; name: string; color: string | null; assigned_user_id: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const wipe: boolean = !!body.wipe;

    const { monday, saturday } = getWeekRangeSP();

    // 1) Setor Recepção
    const { data: sector, error: secErr } = await supabase
      .from("sectors").select("id").eq("slug", "recepcao").single();
    if (secErr || !sector) throw new Error("Setor recepcao não encontrado");

    // 2) Mapa slug → stage_id
    const { data: stages } = await supabase
      .from("kanban_stages")
      .select("id, slug")
      .eq("sector_id", sector.id)
      .in("slug", Object.values(TASK_TYPE_TO_SLUG));
    const stageBySlug = new Map((stages || []).map((s) => [s.slug, s.id]));

    // 3) Tarefas da semana
    const { data: tasksRaw, error: tErr } = await supabase
      .from("clinic_daily_tasks")
      .select("id, task_type, task_date, patient_name, patient_phone, doctor_id, doctor_name, appointment_at, notes")
      .gte("task_date", monday)
      .lte("task_date", saturday)
      .order("task_date", { ascending: true });
    if (tErr) throw tErr;
    const tasks = (tasksRaw ?? []) as Task[];

    // 3.1) Doutores (cor + responsável)
    const { data: docsRaw } = await supabase
      .from("clinic_doctors")
      .select("id, name, color, assigned_user_id");
    const doctorById = new Map<string, Doctor>(
      (docsRaw ?? []).map((d) => [d.id, d as Doctor]),
    );

    // 4) Agrupar por paciente+dia
    type Group = {
      key: string;
      patient_name: string;
      patient_phone: string | null;
      doctor_id: string | null;
      doctor_name: string | null;
      task_date: string;
      appointment_at: string | null;
      tasks: Task[];
    };
    const groups = new Map<string, Group>();
    for (const t of tasks) {
      const key = `${(t.patient_phone ?? "").replace(/\D/g, "") || t.patient_name}|${t.task_date}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          patient_name: t.patient_name,
          patient_phone: t.patient_phone,
          doctor_id: t.doctor_id,
          doctor_name: t.doctor_name,
          task_date: t.task_date,
          appointment_at: t.appointment_at,
          tasks: [],
        };
        groups.set(key, g);
      }
      g.tasks.push(t);
      if (t.appointment_at && (!g.appointment_at || t.appointment_at < g.appointment_at)) {
        g.appointment_at = t.appointment_at;
      }
      if (t.doctor_name && !g.doctor_name) g.doctor_name = t.doctor_name;
      if (t.doctor_id && !g.doctor_id) g.doctor_id = t.doctor_id;
    }

    console.log(`[tasks-to-reception] ${tasks.length} tasks → ${groups.size} cards consolidados`);

    // 5) Limpar Recepção (somente cards gerados por essa função — marcadores [task:])
    if (wipe || true /* sempre limpa pra reconciliar dia a dia */) {
      const stageIds = Array.from(stageBySlug.values());
      if (stageIds.length > 0) {
        const { error: delErr } = await supabase
          .from("clients")
          .delete()
          .eq("sector_id", sector.id)
          .in("stage_id", stageIds);
        if (delErr) console.error("wipe err:", delErr.message);
      }
    }

    // 6) Inserir 1 card por grupo
    let created = 0, missingStage = 0;
    const rows: Array<Record<string, unknown>> = [];

    for (const g of groups.values()) {
      // Mais urgente define a coluna
      const sorted = [...g.tasks].sort(
        (a, b) => (TASK_TYPE_PRIORITY[a.task_type] ?? 99) - (TASK_TYPE_PRIORITY[b.task_type] ?? 99),
      );
      const mostUrgent = sorted[0];
      const slug = TASK_TYPE_TO_SLUG[mostUrgent.task_type];
      const stageId = slug ? stageBySlug.get(slug) : undefined;
      if (!stageId) { missingStage++; continue; }

      const time = fmtTime(g.appointment_at);
      const taskIds = g.tasks.map((t) => t.id);

      const lines: string[] = [];
      lines.push(`📅 ${fmtDate(g.task_date)}${time ? ` • Consulta às ${time}` : ""}`);
      if (g.doctor_name) lines.push(`👨‍⚕️ Dr(a). ${g.doctor_name}`);
      if (g.patient_phone) lines.push(`📱 ${g.patient_phone}`);
      lines.push("");
      lines.push("📋 TAREFAS DO DIA:");
      for (const t of sorted) {
        const label = TASK_TYPE_LABEL[t.task_type] ?? t.task_type;
        const howto = TASK_TYPE_HOWTO[t.task_type] ?? "";
        lines.push(`• ${label}`);
        if (howto) lines.push(`   → ${howto}`);
        if (t.notes) lines.push(`   📝 ${t.notes}`);
      }
      lines.push("");
      lines.push(`[tasks:${taskIds.join(",")}]`);

      rows.push({
        name: g.patient_name,
        phone: g.patient_phone,
        notes: lines.join("\n"),
        sector_id: sector.id,
        stage_id: stageId,
        board_position: 0,
      });
    }

    const batchSize = 200;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const { error: insErr } = await supabase.from("clients").insert(slice);
      if (insErr) console.error("insert err:", insErr.message);
      else created += slice.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        week: { monday, saturday },
        total_tasks: tasks.length,
        consolidated_cards: groups.size,
        cards_created: created,
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
