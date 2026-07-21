// Edge function: Gestor Tático IA — chat streaming com tool calling
// Permite ao usuário conversar com a IA, que consulta dados reais do sistema.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SYSTEM_PROMPT = `Você é o **Gestor Tático IA** da clínica — um copiloto direto, objetivo e estratégico.

Seu papel:
- Ajudar o time (colaboradores) e os gestores (admins) a entenderem performance, prioridades e gargalos com base em DADOS REAIS do sistema.
- SEMPRE que a pergunta envolver dados (vendas, prioridades, tarefas, atendimentos, agenda, feedbacks, metas), use as ferramentas disponíveis. Nunca invente números.
- Quando usar uma ferramenta, faça-o em silêncio e depois apresente a análise em linguagem natural, com bullets curtos e insights práticos.
- Se for colaborador comum, os dados retornados já vêm filtrados só para ele — fale na 2ª pessoa ("você fez X").
- Se for admin, você pode comparar pessoas, dar rankings, identificar quem está atrasado.
- Português do Brasil, tom direto, sem rodeios. Use markdown (negrito, listas).
- Datas no formato DD/MM. Valores em R$.
- Se não tiver dado suficiente, diga e sugira como o usuário pode gerar/registrar.

Hoje é ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}.`;

// ====== TOOLS DEFINITION ======
const tools = [
  {
    type: "function",
    function: {
      name: "consultar_vendas",
      description: "Lista vendas em um período. Soma valores, lucros e conta novos pacientes.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Data inicial YYYY-MM-DD" },
          end_date: { type: "string", description: "Data final YYYY-MM-DD" },
          user_id: { type: "string", description: "Opcional: filtrar por usuário (só admin)" },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_prioridades",
      description: "Retorna prioridades diárias (missão principal + secundárias) num intervalo.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string" },
          end_date: { type: "string" },
          user_id: { type: "string", description: "Opcional (só admin)" },
          status: { type: "string", enum: ["pending", "completed", "all"] },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_tarefas_pendentes",
      description: "Lista tarefas do funil de execução em aberto (client_tasks + client_task_items).",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          due_before: { type: "string", description: "Pega tarefas com prazo até essa data YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_atendimentos_whatsapp",
      description: "Resumo de atendimentos pendentes no WhatsApp (esperando ou em andamento).",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_metas_mes",
      description: "Compara metas do mês com o realizado (vendas, novos pacientes).",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "YYYY-MM. Default: mês atual." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_agenda_clinica",
      description: "Agendamentos da clínica num intervalo.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string" },
          end_date: { type: "string" },
          doctor_id: { type: "string" },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_aderencia_rotina",
      description: "Quantas tarefas de rotina foram concluídas vs total no período.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string" },
          end_date: { type: "string" },
          user_id: { type: "string" },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_usuarios",
      description: "Lista colaboradores ativos (id, nome, setor). Útil para descobrir IDs antes de filtrar.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ====== TOOL EXECUTION ======
async function executeTool(
  name: string,
  args: any,
  ctx: { admin: any; userId: string; isAdmin: boolean }
): Promise<any> {
  const { admin, userId, isAdmin } = ctx;
  const scopeUser = isAdmin ? args.user_id : userId; // colaborador só vê próprios dados

  try {
    switch (name) {
      case "listar_usuarios": {
        const { data } = await admin
          .from("profiles")
          .select("user_id, display_name, email, sector_id, is_active")
          .eq("is_active", true)
          .limit(100);
        return { users: data ?? [] };
      }

      case "consultar_vendas": {
        let q = admin
          .from("sales")
          .select("id, sale_date, amount, cost, profit, is_new_patient, created_by, client_id, description")
          .gte("sale_date", args.start_date)
          .lte("sale_date", args.end_date)
          .order("sale_date", { ascending: false })
          .limit(500);
        if (scopeUser) q = q.eq("created_by", scopeUser);
        const { data, error } = await q;
        if (error) throw error;
        const total = (data ?? []).reduce((a, s: any) => a + Number(s.amount || 0), 0);
        const lucro = (data ?? []).reduce((a, s: any) => a + Number(s.profit || 0), 0);
        const novos = (data ?? []).filter((s: any) => s.is_new_patient).length;
        return {
          period: `${args.start_date} a ${args.end_date}`,
          count: data?.length ?? 0,
          total_amount: total,
          total_profit: lucro,
          new_patients: novos,
          sales: (data ?? []).slice(0, 50),
        };
      }

      case "consultar_prioridades": {
        let q = admin
          .from("daily_priorities")
          .select("id, user_id, priority_date, mission_main, secondary_1, secondary_2, status, yesterday_feedback")
          .gte("priority_date", args.start_date)
          .lte("priority_date", args.end_date)
          .order("priority_date", { ascending: false })
          .limit(200);
        if (scopeUser) q = q.eq("user_id", scopeUser);
        if (args.status && args.status !== "all") q = q.eq("status", args.status);
        const { data, error } = await q;
        if (error) throw error;
        return { count: data?.length ?? 0, items: data ?? [] };
      }

      case "consultar_tarefas_pendentes": {
        const dueBefore = args.due_before ?? new Date().toISOString().slice(0, 10);
        let q1 = admin
          .from("client_tasks")
          .select("id, title, description, due_date, assigned_to, completed_at, client_id")
          .is("completed_at", null)
          .lte("due_date", dueBefore)
          .limit(100);
        if (scopeUser) q1 = q1.eq("assigned_to", scopeUser);
        const { data: tasks } = await q1;

        let q2 = admin
          .from("client_task_items")
          .select("id, task_label, task_type, task_date, status, client_id")
          .neq("status", "completed")
          .lte("task_date", dueBefore)
          .limit(100);
        const { data: items } = await q2;

        return {
          due_before: dueBefore,
          client_tasks: tasks ?? [],
          task_items: items ?? [],
          total: (tasks?.length ?? 0) + (items?.length ?? 0),
        };
      }

      case "consultar_atendimentos_whatsapp": {
        let q = admin
          .from("whatsapp_pending_attendances")
          .select("id, from_phone, from_name, status, classification, last_message_at, assigned_to, client_id")
          .eq("status", "waiting")
          .order("last_message_at", { ascending: true })
          .limit(100);
        if (scopeUser) q = q.eq("assigned_to", scopeUser);
        const { data } = await q;
        return { count: data?.length ?? 0, attendances: data ?? [] };
      }

      case "consultar_metas_mes": {
        const month = args.month ?? new Date().toISOString().slice(0, 7);
        const start = `${month}-01`;
        const endDate = new Date(start);
        endDate.setMonth(endDate.getMonth() + 1);
        const end = endDate.toISOString().slice(0, 10);

        const { data: goals } = await admin
          .from("monthly_goals")
          .select("*")
          .eq("period_month", start)
          .maybeSingle();

        const { data: sales } = await admin
          .from("sales")
          .select("amount, profit, is_new_patient")
          .gte("sale_date", start)
          .lt("sale_date", end);

        const realizado = {
          revenue: (sales ?? []).reduce((a: number, s: any) => a + Number(s.amount || 0), 0),
          profit: (sales ?? []).reduce((a: number, s: any) => a + Number(s.profit || 0), 0),
          new_patients: (sales ?? []).filter((s: any) => s.is_new_patient).length,
        };

        return { month, goals: goals ?? null, realizado };
      }

      case "consultar_agenda_clinica": {
        let q = admin
          .from("clinic_appointments")
          .select("id, patient_name, patient_phone, doctor_name, doctor_id, appointment_at, duration_min, status, notes")
          .gte("appointment_at", `${args.start_date}T00:00:00`)
          .lte("appointment_at", `${args.end_date}T23:59:59`)
          .order("appointment_at", { ascending: true })
          .limit(300);
        if (args.doctor_id) q = q.eq("doctor_id", args.doctor_id);
        const { data } = await q;
        return { count: data?.length ?? 0, appointments: data ?? [] };
      }

      case "consultar_aderencia_rotina": {
        const { data: tasks } = await admin
          .from("routine_tasks")
          .select("id, title, frequency")
          .eq("active", true);

        let q = admin
          .from("task_completions")
          .select("task_id, user_id, completion_date")
          .gte("completion_date", args.start_date)
          .lte("completion_date", args.end_date);
        if (scopeUser) q = q.eq("user_id", scopeUser);
        const { data: completions } = await q;

        return {
          period: `${args.start_date} a ${args.end_date}`,
          total_active_tasks: tasks?.length ?? 0,
          total_completions: completions?.length ?? 0,
          completions_per_user: Object.entries(
            (completions ?? []).reduce((acc: any, c: any) => {
              acc[c.user_id] = (acc[c.user_id] || 0) + 1;
              return acc;
            }, {})
          ).map(([user_id, count]) => ({ user_id, count })),
        };
      }

      default:
        return { error: `Ferramenta desconhecida: ${name}` };
    }
  } catch (e: any) {
    return { error: e.message ?? String(e) };
  }
}

// ====== HANDLER ======
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin");

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", userId)
      .maybeSingle();

    const { messages: clientMessages, conversation_id } = await req.json();

    if (!Array.isArray(clientMessages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sysPreamble = `${SYSTEM_PROMPT}

Usuário atual: **${profile?.display_name ?? profile?.email ?? "Colaborador"}** (user_id: ${userId}).
Papel: ${isAdmin ? "ADMIN — pode ver dados de qualquer pessoa" : "COLABORADOR — só pode ver seus próprios dados"}.`;

    const messages: any[] = [
      { role: "system", content: sysPreamble },
      ...clientMessages,
    ];

    // Tool-calling loop (resolve tools server-side, then stream final answer)
    const ctx = { admin, userId, isAdmin };
    let safety = 0;

    while (safety < 6) {
      safety++;
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Lovable-API-Key": LOVABLE_API_KEY,
          "Content-Type": "application/json",
          "X-Lovable-AIG-SDK": "raw-fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        if (resp.status === 429)
          return new Response(JSON.stringify({ error: "Limite de uso atingido. Aguarde alguns segundos." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        if (resp.status === 402)
          return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos em Configurações > Workspace > Uso." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        console.error("AI gateway error:", resp.status, t);
        return new Response(JSON.stringify({ error: "Falha na IA" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (msg?.tool_calls?.length) {
        // Append assistant tool call
        messages.push({
          role: "assistant",
          content: msg.content ?? "",
          tool_calls: msg.tool_calls,
        });
        // Execute each tool
        for (const tc of msg.tool_calls) {
          let parsedArgs: any = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
          const result = await executeTool(tc.function.name, parsedArgs, ctx);
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result).slice(0, 30000),
          });
        }
        continue; // loop again to let model reason
      }

      // Final answer — return as JSON (frontend renders markdown)
      const finalContent = msg?.content ?? "Não consegui gerar uma resposta.";

      // Persist messages if conversation_id provided
      if (conversation_id) {
        const lastUser = clientMessages[clientMessages.length - 1];
        if (lastUser?.role === "user") {
          await admin.from("ai_chat_messages").insert({
            conversation_id,
            user_id: userId,
            role: "user",
            content: lastUser.content,
          });
        }
        await admin.from("ai_chat_messages").insert({
          conversation_id,
          user_id: userId,
          role: "assistant",
          content: finalContent,
        });
        await admin
          .from("ai_chat_conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation_id);
      }

      return new Response(JSON.stringify({ content: finalContent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Loop de ferramentas excedeu limite" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("tactical-ai-chat error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
