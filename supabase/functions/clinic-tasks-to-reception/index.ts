// Sincroniza tarefas da Agenda Clínica (clinic_daily_tasks) da semana corrente
// para o kanban da Recepção.
//
// Modelo NOVO (3 colunas):
//   1) 🚨 Novos clientes urgente (criados manualmente / sem agenda)
//   2) 📋 Fazer hoje  ← TODOS os cards consolidados ficam aqui
//   3) ✅ Concluído
//
// Por paciente + task_date geramos UM card. Cada tarefa do dia (D-7 a D-1,
// aniversário, etc.) vira um item em `client_task_items` com seu próprio
// status, label, "como fazer" e nota/print de comprovação.
//
// Idempotente: limpa cards anteriores da Recepção em 'Fazer hoje' que tenham
// [tasks:...] no notes (gerados por essa função) e regera tudo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Quanto MENOR, mais urgente
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
  birthday: "🎂 Mensagem de aniversário",
  confirm_d7: "📩 Enviar mensagem D-7 (1º contato)",
  confirm_d6: "📩 Enviar mensagem D-6 (2º contato)",
  confirm_d5: "📩 Enviar mensagem D-5 (3º contato)",
  confirm_d4: "📩 Enviar mensagem D-4 (4º contato)",
  protocol_d3: "⚠️ Protocolo escassez/urgência D-3",
  urgency_d2: "🔥 Protocolo urgência desmarcar D-2",
  unbook_confirm_d1: "🚨 Confirmação/desmarque D-1",
};

const TASK_TYPE_HOWTO: Record<string, string> = {
  birthday: "Envie mensagem de feliz aniversário + convite para revisão/agendamento.",
  confirm_d7: "1º contato de confirmação. Confirme dia, hora e doutor(a).",
  confirm_d6: "2º toque caso ainda não tenha respondido.",
  confirm_d5: "3º toque. Reforce horário e endereço.",
  confirm_d4: "4º toque. Pergunte se há dúvida ou ajuste de horário.",
  protocol_d3: "Aplique protocolo: ligar + WhatsApp + nota de voz.",
  urgency_d2: "Crie senso de urgência/escassez. Confirme presença HOJE.",
  unbook_confirm_d1: "Última chance: confirmar OU desmarcar para liberar a vaga.",
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

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

async function runSync(supabase: ReturnType<typeof createClient>) {
  const { monday, saturday } = getWeekRangeSP();
  console.log(`[tasks-to-reception:bg] start week=${monday}..${saturday}`);

    // 1) Setor Recepção + colunas
    const { data: sector, error: secErr } = await supabase
      .from("sectors").select("id").eq("slug", "recepcao").single();
    if (secErr || !sector) throw new Error("Setor recepcao não encontrado");

    const { data: stages } = await supabase
      .from("kanban_stages")
      .select("id, slug")
      .eq("sector_id", sector.id)
      .in("slug", ["reception-todo", "reception-new-urgent", "task-done"]);
    const stageBySlug = new Map((stages ?? []).map((s) => [s.slug, s.id]));
    const todoStageId = stageBySlug.get("reception-todo");
    const doneStageId = stageBySlug.get("task-done");
    if (!todoStageId) throw new Error("Stage 'reception-todo' não encontrada");

    // 2) Tarefas da semana
    const { data: tasksRaw, error: tErr } = await supabase
      .from("clinic_daily_tasks")
      .select("id, task_type, task_date, patient_name, patient_phone, doctor_id, doctor_name, appointment_at, notes")
      .gte("task_date", monday)
      .lte("task_date", saturday)
      .order("task_date", { ascending: true });
    if (tErr) throw tErr;
    const tasks = (tasksRaw ?? []) as Task[];

    // 3) Doutores
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

    console.log(`[tasks-to-reception] ${tasks.length} tasks → ${groups.size} cards`);

    // 5) Limpar cards anteriores gerados pela função (mantém manuais)
    //    Critério: tem [tasks:...] no notes E NÃO está em 'Concluído'.
    //    Deleta em LOTES para não estourar o timeout do PostgREST.
    const { data: oldCards } = await supabase
      .from("clients")
      .select("id")
      .eq("sector_id", sector.id)
      .like("notes", "%[tasks:%")
      .neq("stage_id", doneStageId ?? "00000000-0000-0000-0000-000000000000");
    const oldIds = (oldCards ?? []).map((c) => c.id);
    console.log(`[tasks-to-reception] cleaning ${oldIds.length} old cards`);
    const DEL_BATCH = 100;
    for (let i = 0; i < oldIds.length; i += DEL_BATCH) {
      const chunk = oldIds.slice(i, i + DEL_BATCH);
      const { error: delItemsErr } = await supabase
        .from("client_task_items").delete().in("client_id", chunk);
      if (delItemsErr) console.error("del items err:", delItemsErr.message);
      const { error: delCardsErr } = await supabase
        .from("clients").delete().in("id", chunk);
      if (delCardsErr) console.error("del cards err:", delCardsErr.message);
    }

    // 6) Inserir cards + items em LOTE (evita timeout/502 com muitos roundtrips)
    let cardsCreated = 0;
    let itemsCreated = 0;

    type GroupPrepared = {
      g: Group;
      sorted: Task[];
      docName: string;
      docColor: string;
      assignedTo: string | null;
      notes: string;
    };
    const prepared: GroupPrepared[] = [];

    for (const g of groups.values()) {
      const sorted = [...g.tasks].sort(
        (a, b) => (TASK_TYPE_PRIORITY[a.task_type] ?? 99) - (TASK_TYPE_PRIORITY[b.task_type] ?? 99),
      );
      const doc = g.doctor_id ? doctorById.get(g.doctor_id) : undefined;
      const docColor = doc?.color ?? "";
      const docName = g.doctor_name ?? doc?.name ?? "";
      const assignedTo = doc?.assigned_user_id ?? null;
      const time = fmtTime(g.appointment_at);
      const taskIds = g.tasks.map((t) => t.id);

      const lines: string[] = [];
      if (docName) lines.push(`[doctor:${docName}|${docColor}]`);
      lines.push(`📅 ${fmtDate(g.task_date)}${time ? ` • Consulta às ${time}` : ""}`);
      if (docName) lines.push(`👨‍⚕️ Dr(a). ${docName}`);
      if (g.patient_phone) lines.push(`📱 ${g.patient_phone}`);
      lines.push("");
      lines.push(`[task_date:${g.task_date}]`);
      if (g.appointment_at) lines.push(`[appt:${g.appointment_at}]`);
      lines.push(`[tasks:${taskIds.join(",")}]`);

      prepared.push({ g, sorted, docName, docColor, assignedTo, notes: lines.join("\n") });
    }

    // Inserir clients em lotes de 200
    const BATCH = 200;
    for (let i = 0; i < prepared.length; i += BATCH) {
      const slice = prepared.slice(i, i + BATCH);
      const rows = slice.map((p) => ({
        name: p.g.patient_name,
        phone: p.g.patient_phone,
        notes: p.notes,
        sector_id: sector.id,
        stage_id: todoStageId,
        assigned_to: p.assignedTo,
        board_position: 0,
      }));
      const { data: insertedRows, error: insErr } = await supabase
        .from("clients")
        .insert(rows)
        .select("id");
      if (insErr || !insertedRows) {
        console.error("client batch insert err:", insErr?.message);
        continue;
      }
      cardsCreated += insertedRows.length;

      // Cada linha inserida corresponde, em ordem, a um item de `slice`
      const itemsBatch: Array<Record<string, unknown>> = [];
      insertedRows.forEach((row, idx) => {
        const p = slice[idx];
        if (!p) return;
        p.sorted.forEach((t, k) => {
          itemsBatch.push({
            client_id: row.id,
            daily_task_id: t.id,
            task_type: t.task_type,
            task_label: TASK_TYPE_LABEL[t.task_type] ?? t.task_type,
            task_howto: TASK_TYPE_HOWTO[t.task_type] ?? null,
            task_date: p.g.task_date,
            status: "pending",
            sort_order: k,
          });
        });
      });

      // Inserir items em sub-lotes
      for (let j = 0; j < itemsBatch.length; j += 500) {
        const chunk = itemsBatch.slice(j, j + 500);
        const { error: itemErr } = await supabase.from("client_task_items").insert(chunk);
        if (itemErr) console.error("items insert err:", itemErr.message);
        else itemsCreated += chunk.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        week: { monday, saturday },
        tasks: tasks.length,
        cards_created: cardsCreated,
        items_created: itemsCreated,
        skipped_existing: 0,
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
