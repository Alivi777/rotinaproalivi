import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type GPTMakerNote = {
  id: string;
  client_id: string;
  author_id: string;
  body: string;
  created_at: string;
  external_id: string | null;
};

export type GPTMakerMetrics = {
  totalMessages: number;
  inbound: number; // do cliente
  outbound: number; // do bot/atendente
  conversations: number; // clientes distintos
  responseRate: number; // 0..1 — % de clientes que receberam resposta após mensagem inbound
  avgMessagesPerConversation: number;
  daily: { date: string; inbound: number; outbound: number; total: number }[];
  topClients: { client_id: string; name: string; total: number; lastAt: string }[];
};

const SYSTEM_AUTHOR = "00000000-0000-0000-0000-000000000000";

function parseDirection(body: string): "in" | "out" {
  // Note bodies look like "[GPT Maker · Bot · 14:32] texto" or "[GPT Maker · Cliente · 14:32] texto"
  const m = body.match(/^\[GPT Maker · (Bot|Cliente)/i);
  if (m && m[1].toLowerCase() === "bot") return "out";
  return "in";
}

function dayKey(iso: string) {
  // YYYY-MM-DD em fuso de SP
  const d = new Date(iso);
  const sp = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const y = sp.getFullYear();
  const mm = String(sp.getMonth() + 1).padStart(2, "0");
  const dd = String(sp.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export function useGPTMakerMetrics(startDate: string, endDate: string) {
  const [metrics, setMetrics] = useState<GPTMakerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Range em ISO (incluindo o dia inteiro do endDate)
    const startIso = `${startDate}T00:00:00-03:00`;
    const endIso = `${endDate}T23:59:59-03:00`;

    const { data: notes, error: notesErr } = await supabase
      .from("client_notes")
      .select("id, client_id, author_id, body, created_at, external_id")
      .eq("source", "gptmaker")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: true })
      .limit(5000);

    if (notesErr) {
      setError(notesErr.message);
      setLoading(false);
      return;
    }

    const rows = (notes || []) as GPTMakerNote[];

    if (rows.length === 0) {
      setMetrics({
        totalMessages: 0,
        inbound: 0,
        outbound: 0,
        conversations: 0,
        responseRate: 0,
        avgMessagesPerConversation: 0,
        daily: [],
        topClients: [],
      });
      setLoading(false);
      return;
    }

    // Buscar nomes de clientes envolvidos
    const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", clientIds);
    const nameById = new Map<string, string>();
    for (const c of (clients || []) as { id: string; name: string }[]) {
      nameById.set(c.id, c.name);
    }

    let inbound = 0;
    let outbound = 0;
    const dailyMap = new Map<string, { inbound: number; outbound: number }>();
    const perClient = new Map<
      string,
      { total: number; lastAt: string; hasInbound: boolean; gotReply: boolean }
    >();

    for (const r of rows) {
      const dir = parseDirection(r.body);
      if (dir === "in") inbound++;
      else outbound++;

      const dk = dayKey(r.created_at);
      const dRow = dailyMap.get(dk) || { inbound: 0, outbound: 0 };
      if (dir === "in") dRow.inbound++;
      else dRow.outbound++;
      dailyMap.set(dk, dRow);

      const cur = perClient.get(r.client_id) || {
        total: 0,
        lastAt: r.created_at,
        hasInbound: false,
        gotReply: false,
      };
      cur.total++;
      if (r.created_at > cur.lastAt) cur.lastAt = r.created_at;
      if (dir === "in") cur.hasInbound = true;
      else if (cur.hasInbound) cur.gotReply = true;
      perClient.set(r.client_id, cur);
    }

    // Response rate: clientes que mandaram inbound e receberam reply / total que mandaram inbound
    let withInbound = 0;
    let replied = 0;
    for (const v of perClient.values()) {
      if (v.hasInbound) {
        withInbound++;
        if (v.gotReply) replied++;
      }
    }
    const responseRate = withInbound === 0 ? 0 : replied / withInbound;

    // Daily ordenado e preenchido
    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        inbound: v.inbound,
        outbound: v.outbound,
        total: v.inbound + v.outbound,
      }));

    // Top clientes
    const topClients = Array.from(perClient.entries())
      .map(([client_id, v]) => ({
        client_id,
        name: nameById.get(client_id) || "Cliente sem nome",
        total: v.total,
        lastAt: v.lastAt,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    setMetrics({
      totalMessages: rows.length,
      inbound,
      outbound,
      conversations: clientIds.length,
      responseRate,
      avgMessagesPerConversation: clientIds.length === 0 ? 0 : rows.length / clientIds.length,
      daily,
      topClients,
    });
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  return { metrics, loading, error, reload: load };
}

export { SYSTEM_AUTHOR };
