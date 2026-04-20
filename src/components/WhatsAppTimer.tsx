import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Square, Clock, MapPin } from "lucide-react";
import { spClock, spToday, fmtMinutes } from "@/lib/spTime";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Session = {
  id: string;
  client_id: string | null;
  started_at: string;
  ended_at: string | null;
};

type Client = { id: string; name: string };

export default function WhatsAppTimer() {
  const { user } = useAuth();
  const [active, setActive] = useState<Session | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [todayMin, setTodayMin] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [now, setNow] = useState(new Date());
  const tick = useRef<number | null>(null);

  // Live SP clock and live elapsed
  useEffect(() => {
    tick.current = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, []);

  async function load() {
    if (!user) return;
    const today = spToday();
    const [a, c, m] = await Promise.all([
      supabase
        .from("whatsapp_sessions")
        .select("id, client_id, started_at, ended_at")
        .eq("user_id", user.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("clients").select("id, name").order("name"),
      supabase.rpc("whatsapp_user_minutes", {
        _start_date: today,
        _end_date: today,
      }),
    ]);
    setActive((a.data as Session) ?? null);
    if (c.data) setClients(c.data as Client[]);
    const mine = (m.data ?? []).find((x: any) => x.user_id === user.id);
    setTodayMin(mine ? Number(mine.total_minutes) : 0);
    setTodayCount(mine ? Number(mine.session_count) : 0);
  }

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`wa-timer-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_sessions",
          filter: `user_id=eq.${user.id}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function start() {
    if (!user) return;
    const { error } = await supabase.from("whatsapp_sessions").insert({
      user_id: user.id,
      client_id: clientId || null,
      source: "manual",
    });
    if (error) return toast.error(error.message);
    toast.success("Atendimento iniciado");
  }

  async function stop() {
    if (!active) return;
    const { error } = await supabase
      .from("whatsapp_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", active.id);
    if (error) return toast.error(error.message);
    toast.success("Atendimento encerrado");
    setClientId("");
  }

  const elapsedSec = active
    ? Math.floor((now.getTime() - new Date(active.started_at).getTime()) / 1000)
    : 0;
  const elapsedFmt = `${String(Math.floor(elapsedSec / 3600)).padStart(2, "0")}:${String(
    Math.floor((elapsedSec / 60) % 60)
  ).padStart(2, "0")}:${String(elapsedSec % 60).padStart(2, "0")}`;

  const liveTodayMin = todayMin + (active ? elapsedSec / 60 : 0);

  return (
    <Card
      className={cn(
        "p-5 mb-6 border-2 transition-all",
        active ? "border-primary/60 bg-primary/5" : "border-border/60"
      )}
    >
      <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-1">
            <MapPin className="h-3 w-3" /> Horário de São Paulo
          </div>
          <div className="text-2xl font-bold tabular-nums">{spClock(now)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Hoje
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {fmtMinutes(liveTodayMin)}
          </div>
          <div className="text-xs text-muted-foreground">
            {todayCount + (active ? 1 : 0)} atendimento(s)
          </div>
        </div>
      </div>

      {active ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default" className="gap-1.5 animate-pulse-slow">
            <Clock className="h-3 w-3" /> Em atendimento
          </Badge>
          <span className="text-3xl font-bold tabular-nums text-primary">
            {elapsedFmt}
          </span>
          {active.client_id && (
            <span className="text-sm text-muted-foreground">
              ·{" "}
              {clients.find((c) => c.id === active.client_id)?.name ?? "Cliente"}
            </span>
          )}
          <Button
            variant="destructive"
            onClick={stop}
            className="ml-auto gap-2"
          >
            <Square className="h-4 w-4" /> Encerrar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="flex-1 min-w-48">
              <SelectValue placeholder="Cliente (opcional)" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={start} className="gap-2">
            <Play className="h-4 w-4" /> Iniciar atendimento
          </Button>
        </div>
      )}
    </Card>
  );
}
