import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Loader2, Plus, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type Conv = { id: string; title: string; last_message_at: string };

const SUGGESTIONS = [
  "Como foi minha semana?",
  "O que preciso fazer hoje?",
  "Bati a meta do mês?",
  "Quantos atendimentos pendentes tenho?",
];

export default function TacticalAIChat({ compact = false }: { compact?: boolean }) {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadConversations();
  }, [userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function loadConversations() {
    if (!userId) return;
    const { data } = await supabase
      .from("ai_chat_conversations")
      .select("id, title, last_message_at")
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(30);
    setConversations(data ?? []);
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from("ai_chat_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at");
    setMessages((data ?? []).filter((m: any) => m.role === "user" || m.role === "assistant") as Msg[]);
    setActiveId(convId);
  }

  async function newConversation() {
    setActiveId(null);
    setMessages([]);
  }

  async function deleteConversation(id: string) {
    if (!confirm("Apagar essa conversa?")) return;
    await supabase.from("ai_chat_conversations").delete().eq("id", id);
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    loadConversations();
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading || !userId) return;
    setInput("");

    let convId = activeId;
    if (!convId) {
      const { data, error } = await supabase
        .from("ai_chat_conversations")
        .insert({ user_id: userId, title: content.slice(0, 50) })
        .select("id")
        .single();
      if (error) {
        toast.error("Falha ao criar conversa");
        return;
      }
      convId = data.id;
      setActiveId(convId);
      loadConversations();
    }

    const newMessages: Msg[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("tactical-ai-chat", {
        body: { messages: newMessages, conversation_id: convId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages([...newMessages, { role: "assistant", content: data.content }]);
      loadConversations();
    } catch (e: any) {
      toast.error(e.message ?? "Erro na IA");
      setMessages(newMessages);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex gap-4 h-full", compact && "flex-col")}>
      {!compact && (
        <Card className="w-64 shrink-0 p-3 flex flex-col">
          <Button onClick={newConversation} size="sm" className="mb-3">
            <Plus className="h-4 w-4 mr-1" /> Nova conversa
          </Button>
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-1 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-smooth",
                    activeId === c.id ? "bg-primary/15 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
                  )}
                  onClick={() => loadMessages(c.id)}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{c.title}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                  Nenhuma conversa ainda.
                </p>
              )}
            </div>
          </ScrollArea>
        </Card>
      )}

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
              <div className="h-14 w-14 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow mb-4">
                <Sparkles className="h-7 w-7 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold mb-1">Gestor Tático IA</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                Pergunte sobre vendas, prioridades, tarefas, atendimentos, agenda ou metas.
                Eu consulto seus dados reais.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-2 whitespace-normal text-left justify-start"
                    onClick={() => send(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-headings:my-2">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando seus dados...
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Pergunte algo... (Enter envia, Shift+Enter quebra linha)"
            rows={1}
            className="resize-none min-h-[42px] max-h-32"
            disabled={loading}
          />
          <Button onClick={() => send()} disabled={loading || !input.trim()} size="icon">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
