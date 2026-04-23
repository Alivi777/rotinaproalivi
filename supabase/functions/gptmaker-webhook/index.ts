// GPT Maker webhook receiver — appends conversation messages as notes on the matching client.
// Public endpoint (no JWT) authenticated via x-api-key header against GPTMAKER_API_KEY secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function pick<T = unknown>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const parts = k.split(".");
    let cur: any = obj;
    let ok = true;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) cur = cur[p];
      else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur as T;
  }
  return undefined;
}

function extractMessage(body: any) {
  // Try common GPT Maker / chatbot webhook shapes
  const event = pick<string>(body, ["event", "type", "eventType"]) ?? "message";
  const phone = pick<string>(body, [
    "phone",
    "from",
    "from_phone",
    "contact.phone",
    "contact.number",
    "chat.phone",
    "chat.contact.phone",
    "message.from",
    "data.phone",
    "data.contact.phone",
  ]);
  const name = pick<string>(body, [
    "name",
    "from_name",
    "contact.name",
    "chat.contact.name",
    "data.contact.name",
  ]);
  const text = pick<string>(body, [
    "text",
    "message",
    "message.text",
    "message.body",
    "data.text",
    "data.message",
    "data.message.text",
    "content",
  ]);
  const direction =
    pick<string>(body, [
      "direction",
      "message.direction",
      "data.direction",
      "from_me",
    ]) ?? "in";
  const externalId = pick<string>(body, [
    "id",
    "message_id",
    "message.id",
    "data.id",
    "data.message.id",
    "wa_message_id",
  ]);
  const sentAt = pick<string>(body, [
    "timestamp",
    "sent_at",
    "created_at",
    "message.timestamp",
    "data.timestamp",
  ]);
  return { event, phone, name, text, direction, externalId, sentAt };
}

function dirLabel(direction: string | undefined) {
  const d = String(direction ?? "").toLowerCase();
  if (d === "out" || d === "outbound" || d === "sent" || d === "true" || d === "bot")
    return "Bot";
  return "Cliente";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth
  const expected = Deno.env.get("GPTMAKER_API_KEY");
  if (!expected) return json({ error: "Server not configured" }, 500);
  const provided =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expected) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { event, phone, name, text, direction, externalId, sentAt } =
    extractMessage(body);

  if (!text || !phone) {
    return json(
      { ok: true, skipped: "missing phone or text", event },
      200,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Normalize phone via DB function (same logic as WaSeller)
  const { data: normRow, error: normErr } = await supabase.rpc("normalize_phone", {
    _phone: phone,
  });
  if (normErr) {
    console.error("normalize_phone failed", normErr);
    return json({ error: "normalize_phone failed" }, 500);
  }
  const normalized = (normRow as string | null) ?? phone.replace(/\D/g, "");

  // Find client by phone (try normalized + raw last 8 digits as fallback)
  const tail = normalized.slice(-8);
  const { data: clients, error: cliErr } = await supabase
    .from("clients")
    .select("id, name, phone")
    .or(`phone.eq.${normalized},phone.ilike.%${tail}`)
    .limit(5);
  if (cliErr) {
    console.error("client lookup failed", cliErr);
    return json({ error: "client lookup failed" }, 500);
  }

  let clientId = clients?.[0]?.id as string | undefined;

  // If no client, try to match a contact and create a minimal client card so notes can attach
  if (!clientId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, name, phone, sector_id")
      .or(`phone_normalized.eq.${normalized},phone.ilike.%${tail}`)
      .limit(1)
      .maybeSingle();

    if (!contact) {
      return json(
        { ok: true, skipped: "no matching client or contact", phone: normalized },
        200,
      );
    }

    // Pick reception sector & default stage
    const { data: sector } = await supabase
      .from("sectors")
      .select("id")
      .or("slug.ilike.recepcao,name.ilike.recepcao")
      .order("sort_order")
      .limit(1)
      .maybeSingle();

    const { data: stage } = await supabase
      .from("kanban_stages")
      .select("id")
      .eq("sector_id", sector?.id ?? "")
      .eq("active", true)
      .order("sort_order")
      .limit(1)
      .maybeSingle();

    const { data: created, error: createErr } = await supabase
      .from("clients")
      .insert({
        name: name ?? contact.name ?? normalized,
        phone: normalized,
        sector_id: sector?.id ?? contact.sector_id ?? null,
        stage_id: stage?.id ?? null,
      })
      .select("id")
      .single();

    if (createErr) {
      console.error("create client failed", createErr);
      return json({ error: "create client failed" }, 500);
    }
    clientId = created.id;
  }

  // Build note body
  const ts = sentAt ? new Date(sentAt) : new Date();
  const hh = String(ts.getHours()).padStart(2, "0");
  const mm = String(ts.getMinutes()).padStart(2, "0");
  const noteBody = `[GPT Maker · ${dirLabel(direction)} · ${hh}:${mm}] ${text}`;

  // Use a deterministic system author id (zero uuid) — author_id is NOT NULL.
  // Webhooks have no auth.uid(); we use service-role to bypass RLS.
  const SYSTEM_AUTHOR = "00000000-0000-0000-0000-000000000000";

  const { error: insErr } = await supabase.from("client_notes").insert({
    client_id: clientId,
    author_id: SYSTEM_AUTHOR,
    body: noteBody,
    source: "gptmaker",
    external_id: externalId ?? null,
  });

  if (insErr) {
    // Unique violation = duplicate webhook delivery; treat as success.
    if ((insErr as any).code === "23505") {
      return json({ ok: true, deduped: true, client_id: clientId }, 200);
    }
    console.error("insert note failed", insErr);
    return json({ error: "insert note failed", detail: insErr.message }, 500);
  }

  return json({ ok: true, client_id: clientId, event }, 200);
});
