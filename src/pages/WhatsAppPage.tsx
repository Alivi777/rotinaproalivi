import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MessageSquareText, Plus, Phone, Clock, Info } from "lucide-react";
import { toast } from "sonner";
import WhatsAppTimer from "@/components/WhatsAppTimer";
import PendingAttendancesCard from "@/components/PendingAttendancesCard";
import WorkingHoursPanel from "@/components/WorkingHoursPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Message = {
  id: string;
  from_phone: string;
  from_name: string | null;
  message_text: string | null;
  received_at: string;
  client_id: string | null;
};

type Client = { id: string; name: string; phone: string | null };

export default function WhatsAppPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [fromName, setFromName] = useState("");
  const [classification, setClassification] = useState("recepcao");

  async function load() {
    const [m, c] = await Promise.all([
      supabase
        .from("whatsapp_messages")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(100),
      supabase.from("clients").select("id, name, phone"),
    ]);
    if (m.data) setMessages(m.data as Message[]);
    if (c.data) setClients(c.data as Client[]);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("wa-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function add() {
    if (!phone.trim() || !text.trim()) {
      toast.error("Telefone e mensagem são obrigatórios");
      return;
    }
    const matched = clients.find((c) => c.phone && c.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
    const { error } = await supabase.from("whatsapp_messages").insert({
      from_phone: phone.trim(),
      from_name: fromName.trim() || null,
      message_text: text.trim(),
      client_id: matched?.id ?? null,
      classification,
    });
    if (error) return toast.error(error.message);
    toast.success("Entrada registrada");
    setPhone("");
    setText("");
    setFromName("");
    setClassification("recepcao");
    setOpen(false);
    load();
  }

  return (
    <AppShell>
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Entradas WhatsApp</h1>
          <p className="text-muted-foreground mt-1">
            {messages.length} {messages.length === 1 ? "mensagem registrada" : "mensagens registradas"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Registrar entrada
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova mensagem recebida</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Telefone *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 99999-9999" />
              </div>
              <div>
                <Label>Nome do remetente</Label>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
              </div>
              <div>
                <Label>Classificação *</Label>
                <Select value={classification} onValueChange={setClassification}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recepcao">Recepção</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mensagem *</Label>
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
              </div>
              <Button onClick={add} className="w-full">Registrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <WhatsAppTimer />

      <Card className="p-4 mb-6 bg-primary/5 border-primary/20 flex items-start gap-3">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Integração com WhatsApp Business API (Meta)</p>
          <p className="text-muted-foreground mt-1">
            Por enquanto, registre as entradas manualmente. A integração automática via webhook da Meta exige
            App ID, Phone Number ID e Access Token — quando estiver pronto, é só me avisar para conectarmos.
          </p>
        </div>
      </Card>

      {messages.length === 0 ? (
        <Card className="p-12 text-center bg-gradient-card border-border/50">
          <MessageSquareText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma mensagem ainda.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const client = clients.find((c) => c.id === m.client_id);
            return (
              <Card
                key={m.id}
                className="p-5 bg-gradient-card border-border/50 hover:border-primary/30 transition-smooth"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm">
                      {(m.from_name || m.from_phone)[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">
                        {m.from_name || client?.name || "Desconhecido"}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {m.from_phone}
                        {client && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-success/15 text-success text-[10px] uppercase tracking-wide">
                            Cliente
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(m.received_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                {m.message_text && (
                  <p className="text-sm leading-relaxed pl-12 text-foreground/90">
                    {m.message_text}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
