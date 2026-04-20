import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type PendingAttendance = {
  id: string;
  client_id: string | null;
  from_phone: string;
  from_name: string | null;
  assigned_to: string | null;
  sector_id: string | null;
  classification: string;
  status: string;
  last_message_at: string;
  created_at: string;
  transferred_from: string | null;
  transferred_to: string | null;
  transfer_note: string | null;
};

// Plays a short beep using WebAudio (no asset needed)
function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 220);
  } catch {
    /* ignore */
  }
}

export function usePendingAttendances() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const lastNotifiedRef = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("whatsapp_pending_attendances")
      .select("*")
      .eq("status", "waiting")
      .eq("assigned_to", user.id)
      .order("last_message_at", { ascending: true });
    setItems((data ?? []) as PendingAttendance[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
    if (!user?.id) return;
    const ch = supabase
      .channel("wpa-mine")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_pending_attendances" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, load]);

  // Recurring notification: beep + toast every 60s while pending exists
  useEffect(() => {
    if (items.length === 0) return;
    const tick = () => {
      const now = Date.now();
      items.forEach((it) => {
        const last = lastNotifiedRef.current[it.id] ?? 0;
        if (now - last >= 60_000) {
          lastNotifiedRef.current[it.id] = now;
          playBeep();
          toast.warning("⏳ Estou esperando atendimento", {
            description: `${it.from_name || it.from_phone} aguarda há ${Math.round(
              (now - new Date(it.last_message_at).getTime()) / 60000,
            )} min`,
            duration: 8000,
          });
        }
      });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [items]);

  const markAttended = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("whatsapp_pending_attendances")
      .update({
        status: "attended",
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id,
      })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      delete lastNotifiedRef.current[id];
      toast.success("Marcado como atendido");
    }
  }, [user?.id]);

  const transfer = useCallback(async (id: string, toUser: string, note?: string) => {
    const { error } = await supabase.rpc("transfer_attendance", {
      _attendance_id: id,
      _to_user: toUser,
      _note: note ?? null,
    });
    if (error) toast.error(error.message);
    else {
      delete lastNotifiedRef.current[id];
      toast.success("Conversa transferida");
    }
  }, []);

  return { items, loading, markAttended, transfer, reload: load };
}
