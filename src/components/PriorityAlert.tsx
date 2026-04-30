import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTodayPriority, DailyPriority } from "@/lib/usePriority";
import {
  AlertTriangle,
  CheckCircle2,
  MessageCircleQuestion,
  Crosshair,
  Send,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  message: string;
  author_id: string;
  created_at: string;
};

const HOURLY_MS = 60 * 60 * 1000;

export default function PriorityAlert() {
  const { user } = useAuth();
  const { priority } = useTodayPriority();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [showQuestion, setShowQuestion] = useState(false);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const intervalRef = useRef<number | null>(null);

  // Hourly reminder while the priority is still pending
  useEffect(() => {
    if (!priority || priority.status === "acknowledged") {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      return;
    }
    // Notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    const fire = () => {
      toast.warning("⚠️ Lembrete: você ainda não confirmou suas prioridades do dia.", {
        duration: 8000,
      });
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Prioridades do dia pendentes", {
            body: priority.mission_main,
            tag: "priority-reminder",
          });
        }
      } catch {
        /* ignore */
      }
    };
    intervalRef.current = window.setInterval(fire, HOURLY_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [priority?.id, priority?.status]);

  // Load conversation
  useEffect(() => {
    if (!priority) return;
    (async () => {
      const { data } = await supabase
        .from("priority_messages")
        .select("id, message, author_id, created_at")
        .eq("priority_id", priority.id)
        .order("created_at");
      setMessages((data as Msg[]) ?? []);

      const ids = Array.from(
        new Set([
          priority.manager_id,
          priority.user_id,
          ...(data ?? []).map((m: any) => m.author_id),
        ])
      );
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => {
        map[p.user_id] = p.display_name ?? "—";
      });
      setAuthors(map);
    })();

    const ch = supabase
      .channel(`priority-msgs-${priority.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "priority_messages",
          filter: `priority_id=eq.${priority.id}`,
        },
        (payload) => setMessages((prev) => [...prev, payload.new as Msg])
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [priority?.id]);

  if (!priority) return null;

  async function acknowledge() {
    const { error } = await supabase
      .from("daily_priorities")
      .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
      .eq("id", priority!.id);
    if (error) return toast.error(error.message);
    toast.success("Prioridades confirmadas. Bom trabalho!");
  }

  async function toggleDone(field: "mission_main" | "secondary_1" | "secondary_2") {
    const doneKey = `${field}_done` as const;
    const atKey = `${field}_done_at` as const;
    const isDone = (priority as any)[doneKey] as boolean;
    const patch: Record<string, any> = {
      [doneKey]: !isDone,
      [atKey]: !isDone ? new Date().toISOString() : null,
    };
    const { error } = await supabase
      .from("daily_priorities")
      .update(patch)
      .eq("id", priority!.id);
    if (error) return toast.error(error.message);
  }

  async function sendQuestion() {
    if (!reply.trim() || !user) return;
    const { error: e1 } = await supabase.from("priority_messages").insert({
      priority_id: priority!.id,
      author_id: user.id,
      message: reply.trim(),
    });
    if (e1) return toast.error(e1.message);
    if (priority!.status !== "acknowledged") {
      await supabase
        .from("daily_priorities")
        .update({ status: "questioned" })
        .eq("id", priority!.id);
    }
    setReply("");
    setShowQuestion(false);
    toast.success("Pergunta enviada ao gestor.");
  }

  const isOwner = user?.id === priority.user_id;
  const isManager = user?.id === priority.manager_id;
  const acknowledged = priority.status === "acknowledged";

  return (
    <Card
      className={cn(
        "p-5 border-2 mb-6 transition-all",
        acknowledged
          ? "border-primary/40 bg-primary/5"
          : "border-destructive/60 bg-destructive/10 animate-pulse-slow shadow-[0_0_30px_-5px_hsl(var(--destructive)/0.4)]"
      )}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              acknowledged ? "bg-primary/20" : "bg-destructive/20"
            )}
          >
            {acknowledged ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Delegação do gestor — hoje
            </div>
            <h2 className="text-lg font-bold">
              {acknowledged ? "Prioridades aceitas" : "3 Prioridades do dia"}
            </h2>
          </div>
        </div>
        <Badge
          variant={acknowledged ? "default" : "destructive"}
          className="uppercase tracking-wide"
        >
          {priority.status === "pending" && "Aguardando aceite"}
          {priority.status === "questioned" && "Questionada"}
          {priority.status === "acknowledged" && "Aceita"}
        </Badge>
      </div>

      {priority.yesterday_feedback && (
        <div className="mb-4 p-3 rounded-lg bg-background/60 border border-border/50">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Report de ontem (gestor)
          </div>
          <p className="text-sm whitespace-pre-wrap">{priority.yesterday_feedback}</p>
        </div>
      )}

      <div className="space-y-2.5 mb-4">
        <PriorityRow
          label="Missão principal"
          text={priority.mission_main}
          primary
          checkable={isOwner && acknowledged}
          done={priority.mission_main_done}
          onToggle={() => toggleDone("mission_main")}
        />
        {priority.secondary_1 && (
          <PriorityRow
            label="Secundária 1"
            text={priority.secondary_1}
            checkable={isOwner && acknowledged}
            done={priority.secondary_1_done}
            onToggle={() => toggleDone("secondary_1")}
          />
        )}
        {priority.secondary_2 && (
          <PriorityRow
            label="Secundária 2"
            text={priority.secondary_2}
            checkable={isOwner && acknowledged}
            done={priority.secondary_2_done}
            onToggle={() => toggleDone("secondary_2")}
          />
        )}
      </div>

      {isOwner && acknowledged && (
        <CompletionPanel priority={priority} />
      )}

      {isOwner && !acknowledged && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={acknowledge} className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Ok, entendi e aceito
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowQuestion((v) => !v)}
            className="gap-2"
          >
            <MessageCircleQuestion className="h-4 w-4" /> Tenho uma dúvida
          </Button>
          {!acknowledged && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
              <Bell className="h-3 w-3" /> Lembrete a cada 1h até aceitar
            </span>
          )}
        </div>
      )}

      {(showQuestion || messages.length > 0) && (
        <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
          {messages.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "p-2.5 rounded-lg text-sm",
                    m.author_id === priority.manager_id
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-secondary/60"
                  )}
                >
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                    {authors[m.author_id] ?? "—"}
                    {m.author_id === priority.manager_id && " · gestor"}
                  </div>
                  <p className="whitespace-pre-wrap">{m.message}</p>
                </div>
              ))}
            </div>
          )}

          {(isOwner || isManager) && (
            <div className="flex gap-2">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={
                  isManager
                    ? "Responder à dúvida do colaborador…"
                    : "Escreva sua dúvida ou contraponto…"
                }
                rows={2}
                className="text-sm"
              />
              <Button onClick={sendQuestion} size="icon" className="self-end">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PriorityRow({
  label,
  text,
  primary,
}: {
  label: string;
  text: string;
  primary?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border",
        primary
          ? "border-destructive/40 bg-destructive/5"
          : "border-border/50 bg-background/60"
      )}
    >
      <Crosshair
        className={cn("h-4 w-4 mt-0.5 shrink-0", primary ? "text-destructive" : "text-muted-foreground")}
      />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <div className={cn("text-sm", primary && "font-semibold")}>{text}</div>
      </div>
    </div>
  );
}
