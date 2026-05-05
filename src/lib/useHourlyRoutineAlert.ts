import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { useProfile } from "./useProfile";
import { toast } from "sonner";

const todayStr = () => new Date().toISOString().slice(0, 10);

function beep() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 350);
  } catch {
    /* ignore */
  }
}

async function checkPending(userId: string, sectorId: string | null) {
  if (!sectorId) return 0;
  const today = todayStr();
  const [tasksRes, doneRes] = await Promise.all([
    supabase
      .from("routine_tasks")
      .select("id")
      .eq("active", true)
      .eq("sector_id", sectorId),
    supabase
      .from("task_completions")
      .select("task_id")
      .eq("user_id", userId)
      .eq("completion_date", today),
  ]);
  const total = tasksRes.data?.length ?? 0;
  const doneIds = new Set((doneRes.data ?? []).map((d) => d.task_id));
  const pending = (tasksRes.data ?? []).filter((t) => !doneIds.has(t.id)).length;
  return pending;
}

/**
 * Dispara alerta sonoro + toast a cada 1h em horário comercial
 * (08h às 19h, seg–sáb) para o usuário logado, lembrando das tarefas
 * pendentes da rotina do setor.
 */
export function useHourlyRoutineAlert() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const lastFiredHourRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !profile?.sector_id) return;

    let cancelled = false;

    async function tick() {
      const now = new Date();
      const hour = now.getHours();
      const dow = now.getDay();
      // 08h-19h, seg(1)-sab(6)
      if (hour < 8 || hour > 19 || dow === 0) return;

      const key = `${todayStr()}-${hour}`;
      if (lastFiredHourRef.current === key) return;

      // Anti-duplicação cross-tab via localStorage
      const lsKey = `routine-alert:${user!.id}`;
      const lastLs = localStorage.getItem(lsKey);
      if (lastLs === key) {
        lastFiredHourRef.current = key;
        return;
      }

      const pending = await checkPending(user!.id, profile!.sector_id);
      if (cancelled) return;
      if (pending > 0) {
        beep();
        toast.warning(
          `⏰ Lembrete de rotina — ${pending} ${
            pending === 1 ? "tarefa pendente" : "tarefas pendentes"
          } no seu checklist do dia.`,
          {
            duration: 12000,
            action: {
              label: "Abrir rotina",
              onClick: () => {
                window.location.href = "/rotina";
              },
            },
          }
        );
      }
      lastFiredHourRef.current = key;
      localStorage.setItem(lsKey, key);
    }

    // primeira checagem após 5s
    const initial = setTimeout(tick, 5000);
    // rechecar de minuto em minuto (vai disparar só uma vez por hora)
    const interval = setInterval(tick, 60_000);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [user?.id, profile?.sector_id]);
}
