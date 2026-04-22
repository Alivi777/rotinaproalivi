// Webhook receptor de novos atendimentos do WaSeller.
//
// Cada chamada cria UM card novo na coluna "🚨 Novos clientes urgente" do
// setor Recepção, com nome, telefone, tag de origem WaSeller e o histórico
// completo da conversa registrado nas notas do card.
//
// Autenticação: o WaSeller deve enviar a chave em UM destes lugares:
//   - Header: `x-api-key: <WASELLER_API_KEY>`
//   - Header: `Authorization: Bearer <WASELLER_API_KEY>`
//   - Query string: `?token=<WASELLER_API_KEY>`
//
// Payload aceito (flexível — tentamos cobrir os formatos mais comuns):
// {
//   "name": "João Silva",
//   "phone": "+5511999998888",
//   "channel": "whatsapp",
//   "campaign": "promo-abril",
//   "messages": [
//     { "from": "client", "text": "Oi, quero marcar", "at": "2026-04-22T13:00:00Z" },
//     { "from": "agent",  "text": "Claro! Qual horário?", "at": "..." }
//   ]
// }
//
// Aceita também aliases: contact_name/customer_name, contact_phone/whatsapp/number,
// e history/conversation/msgs no lugar de messages.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(phone: unknown): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 8) return null;
  return digits.startsWith("55") ? digits : digits.length <= 11 ? `55${digits}` : digits;
}

function fmtBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const dd = String(sp.getUTCDate()).padStart(2, "0");
  const mm = String(sp.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(sp.getUTCHours()).padStart(2, "0");
  const mi = String(sp.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

// deno-lint-ignore no-explicit-any
function pickFirst(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1) Autenticação
    const expected = Deno.env.get("WASELLER_API_KEY");
    if (!expected) {
      console.error("[waseller-webhook] WASELLER_API_KEY não configurada");
      return new Response(JSON.stringify({ error: "server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const tokenFromQuery = url.searchParams.get("token");
    const tokenFromXApi = req.headers.get("x-api-key");
    const auth = req.headers.get("authorization") ?? "";
    const tokenFromBearer = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : null;

    const provided = tokenFromXApi ?? tokenFromBearer ?? tokenFromQuery;
    if (!provided || provided !== expected) {
      console.warn("[waseller-webhook] auth falhou");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Parse payload
    // deno-lint-ignore no-explicit-any
    let payload: any = {};
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aliases comuns
    const name = String(
      pickFirst(payload, ["name", "contact_name", "customer_name", "client_name", "from_name"]) ??
        "Contato WaSeller",
    ).trim() || "Contato WaSeller";

    const phoneRaw = pickFirst(payload, [
      "phone",
      "contact_phone",
      "customer_phone",
      "whatsapp",
      "number",
      "from_phone",
      "wa_id",
    ]);
    const phone = normalizePhone(phoneRaw);

    const channel = String(pickFirst(payload, ["channel", "source"]) ?? "whatsapp");
    const campaign = pickFirst(payload, ["campaign", "campaign_name", "tag"]);
    const externalId = pickFirst(payload, ["id", "conversation_id", "ticket_id"]);

    const messagesRaw = pickFirst(payload, [
      "messages",
      "history",
      "conversation",
      "msgs",
      "chat",
    ]);
    const messages: Array<{ from?: string; text?: string; at?: string; type?: string }> =
      Array.isArray(messagesRaw) ? messagesRaw : [];

    console.log(
      `[waseller-webhook] recv name="${name}" phone=${phone} msgs=${messages.length}`,
    );

    // 3) Conectar ao banco
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 4) Localizar setor Recepção + coluna "Novos clientes urgente"
    const { data: sector, error: sectorErr } = await supabase
      .from("sectors").select("id").eq("slug", "recepcao").single();
    if (sectorErr || !sector) {
      console.error("setor recepcao não encontrado", sectorErr?.message);
      return new Response(JSON.stringify({ error: "sector recepcao not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: stage, error: stageErr } = await supabase
      .from("kanban_stages")
      .select("id")
      .eq("sector_id", sector.id)
      .eq("slug", "reception-new-urgent")
      .maybeSingle();

    let stageId = stage?.id as string | undefined;
    if (!stageId) {
      // Fallback: pega a primeira coluna ativa do setor
      const { data: anyStage } = await supabase
        .from("kanban_stages")
        .select("id")
        .eq("sector_id", sector.id)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      stageId = anyStage?.id;
    }
    if (!stageId) {
      console.error("nenhuma stage da recepção encontrada", stageErr?.message);
      return new Response(JSON.stringify({ error: "no reception stage" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5) Montar notas com histórico completo + tag de origem
    const lines: string[] = [];
    lines.push(`[origin:waseller|${channel}]`);
    if (campaign) lines.push(`🏷️ Campanha: ${campaign}`);
    if (externalId) lines.push(`🆔 WaSeller: ${externalId}`);
    if (phoneRaw && !phone) lines.push(`📱 ${phoneRaw} (formato inválido)`);
    if (phone) lines.push(`📱 +${phone}`);
    lines.push(`📨 Recebido em ${fmtBR(new Date().toISOString())}`);
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━━━━");
    lines.push("💬 HISTÓRICO DA CONVERSA");
    lines.push("━━━━━━━━━━━━━━━━━━━━━");

    if (messages.length === 0) {
      lines.push("(nenhuma mensagem recebida no payload)");
    } else {
      for (const m of messages) {
        const who = (m.from ?? "").toLowerCase();
        const isAgent = who.includes("agent") || who.includes("atend") || who.includes("oper");
        const prefix = isAgent ? "👤 Atendente" : "🟢 Cliente";
        const when = m.at ? ` (${fmtBR(m.at)})` : "";
        const text = (m.text ?? "").toString().trim() || "(sem texto)";
        lines.push(`${prefix}${when}: ${text}`);
      }
    }

    const notes = lines.join("\n");

    // 6) Criar card SEMPRE novo (deduplicação: criar card novo sempre)
    const { data: created, error: insErr } = await supabase
      .from("clients")
      .insert({
        name,
        phone: phone ? `+${phone}` : (phoneRaw ? String(phoneRaw) : null),
        notes,
        sector_id: sector.id,
        stage_id: stageId,
        board_position: 0,
      })
      .select("id")
      .single();

    if (insErr || !created) {
      console.error("[waseller-webhook] insert card err:", insErr?.message);
      return new Response(JSON.stringify({ error: insErr?.message ?? "insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[waseller-webhook] card criado id=${created.id}`);

    return new Response(
      JSON.stringify({ success: true, client_id: created.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[waseller-webhook] FAIL:", e instanceof Error ? e.message : String(e));
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
