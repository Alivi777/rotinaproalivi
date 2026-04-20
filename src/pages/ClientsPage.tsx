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
import { Plus, Phone, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import NewSaleDialog from "@/components/NewSaleDialog";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("clients").insert({
      name: name.trim(),
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Cliente cadastrado");
    setName("");
    setPhone("");
    setNotes("");
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <AppShell>
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">
            {clients.length} {clients.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+55 11 99999-9999"
                />
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button onClick={add} className="w-full">
                Cadastrar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {clients.length === 0 ? (
        <Card className="p-12 text-center bg-gradient-card border-border/50">
          <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum cliente ainda.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((c) => (
            <Card
              key={c.id}
              className="p-5 bg-gradient-card border-border/50 hover:border-primary/30 transition-smooth group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate">{c.name}</h3>
                  {c.phone && (
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                      <Phone className="h-3.5 w-3.5" />
                      {c.phone}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(c.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {c.notes && (
                <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{c.notes}</p>
              )}
              <div className="mt-4 pt-3 border-t border-border/50">
                <NewSaleDialog clientId={c.id} clientName={c.name} onCreated={load} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
