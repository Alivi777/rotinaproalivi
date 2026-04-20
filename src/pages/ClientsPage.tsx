import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Phone, Trash2, User, LayoutGrid, List, Clock, MessageSquare, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import NewSaleDialog from "@/components/NewSaleDialog";
import ClientDetailDialog from "@/components/ClientDetailDialog";
import ClientCloseDialog from "@/components/ClientCloseDialog";
import { useKanbanStages } from "@/lib/useKanbanStages";
import { useSectors, useProfile } from "@/lib/useProfile";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useClientAlerts, alertLabel } from "@/lib/useClientAlerts";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  stage_id: string | null;
  assigned_to: string | null;
  sector_id: string | null;
  board_position: number;
};
type Profile = { user_id: string; display_name: string | null; sector_id: string | null };

export default function ClientsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { sectors } = useSectors();
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [boardSectorId, setBoardSectorId] = useState<string>("");
  const { stages } = useKanbanStages(boardSectorId || profile?.sector_id);
  const { alerts } = useClientAlerts(
    useMemo(() => clients.map((c) => ({ id: c.id, phone: c.phone })), [clients]),
  );

  // New client form
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [newAssignee, setNewAssignee] = useState<string>("");
  const [newSectorId, setNewSectorId] = useState<string>("");

  // Detail / Close dialogs
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [closeTarget, setCloseTarget] = useState<{
    client: Client;
    stageId: string;
    stageName: string;
    mode: "transition" | "won" | "lost";
  } | null>(null);

  useEffect(() => {
    if (profile?.sector_id && !boardSectorId) setBoardSectorId(profile.sector_id);
    if (user && !newAssignee) setNewAssignee(user.id);
    if (profile?.sector_id && !newSectorId) setNewSectorId(profile.sector_id);
  }, [profile, user, boardSectorId, newAssignee, newSectorId]);

  async function load() {
    const [c, p] = await Promise.all([
      supabase.from("clients").select("*").order("board_position"),
      supabase.from("profiles").select("user_id, display_name, sector_id").eq("is_active", true),
    ]);
    if (c.data) setClients(c.data as Client[]);
    if (p.data) setProfiles(p.data as Profile[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!name.trim()) return;
    const firstStage = stages[0]?.id ?? null;
    const { error } = await supabase.from("clients").insert({
      name: name.trim(),
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      created_by: user?.id,
      assigned_to: newAssignee || user?.id,
      sector_id: newSectorId || profile?.sector_id || null,
      stage_id: firstStage,
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

  async function moveTo(client: Client, stageId: string) {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || stage.id === client.stage_id) return;
    const mode: "transition" | "won" | "lost" = stage.is_won
      ? "won"
      : stage.is_lost
        ? "lost"
        : "transition";
    setCloseTarget({ client, stageId, stageName: stage.name, mode });
  }

  // Filter clients to current board sector
  const boardClients = useMemo(
    () => clients.filter((c) => !boardSectorId || c.sector_id === boardSectorId || !c.sector_id),
    [clients, boardSectorId]
  );

  const nameOf = (uid: string | null) =>
    uid ? profiles.find((p) => p.user_id === uid)?.display_name || "—" : "—";

  return (
    <AppShell>
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">
            {clients.length} {clients.length === 1 ? "cliente" : "clientes"} no total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={boardSectorId} onValueChange={setBoardSectorId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Setor" />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Setor</Label>
                    <Select value={newSectorId} onValueChange={setNewSectorId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Setor" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectors.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Responsável</Label>
                    <Select value={newAssignee} onValueChange={setNewAssignee}>
                      <SelectTrigger>
                        <SelectValue placeholder="Responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => (
                          <SelectItem key={p.user_id} value={p.user_id}>
                            {p.display_name || "Sem nome"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Notas iniciais</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <Button onClick={add} className="w-full">
                  Cadastrar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Tabs value={view} onValueChange={(v) => setView(v as "kanban" | "list")} className="mb-4">
        <TabsList>
          <TabsTrigger value="kanban">
            <LayoutGrid className="h-4 w-4 mr-1" /> Kanban
          </TabsTrigger>
          <TabsTrigger value="list">
            <List className="h-4 w-4 mr-1" /> Lista
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <div className="flex gap-3 overflow-x-auto pb-4">
            {stages.map((stage) => {
              const items = boardClients.filter((c) => c.stage_id === stage.id);
              return (
                <div
                  key={stage.id}
                  className="min-w-[280px] w-[280px] shrink-0 rounded-xl bg-secondary/40 border border-border/50 p-3"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: stage.color ?? "hsl(var(--muted))" }}
                      />
                      <h3 className="font-semibold text-sm">{stage.name}</h3>
                    </div>
                    <Badge variant="secondary" className="h-5 text-xs">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="space-y-2 min-h-[60px]">
                    {items.map((c) => {
                      const reasons = alerts[c.id] ?? [];
                      const isAlert = reasons.length > 0;
                      return (
                      <Card
                        key={c.id}
                        className={cn(
                          "p-3 bg-card hover:border-primary/30 transition-smooth cursor-pointer",
                          isAlert && "border-destructive bg-destructive/5 ring-1 ring-destructive/40",
                        )}
                        onClick={() => setDetailClient(c)}
                        title={isAlert ? alertLabel(reasons) : undefined}
                      >
                        {isAlert && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-destructive mb-1">
                            <AlertTriangle className="h-3 w-3" />
                            {alertLabel(reasons)}
                          </div>
                        )}
                        <div className="font-medium text-sm truncate">{c.name}</div>
                        {c.phone && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {nameOf(c.assigned_to)}
                        </div>
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <Select
                            value={c.stage_id ?? ""}
                            onValueChange={(v) => moveTo(c, v)}
                          >
                            <SelectTrigger
                              className="h-7 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue placeholder="Mover" />
                            </SelectTrigger>
                            <SelectContent>
                              {stages.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  → {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </Card>
                      );
                    })}
                    {items.length === 0 && (
                      <div className="text-xs text-muted-foreground/50 text-center py-6">
                        Vazio
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {stages.length === 0 && (
              <Card className="p-8 text-center w-full">
                <p className="text-muted-foreground">
                  Nenhuma etapa configurada para este setor.
                </p>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          {clients.length === 0 ? (
            <Card className="p-12 text-center bg-gradient-card border-border/50">
              <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum cliente ainda.</p>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {clients.map((c) => {
                const stage = stages.find((s) => s.id === c.stage_id);
                return (
                  <Card
                    key={c.id}
                    className="p-5 bg-gradient-card border-border/50 hover:border-primary/30 transition-smooth group cursor-pointer"
                    onClick={() => setDetailClient(c)}
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
                        {stage && (
                          <Badge
                            variant="secondary"
                            className="mt-2"
                            style={{
                              background: (stage.color ?? "hsl(var(--muted))") + "22",
                              color: stage.color ?? undefined,
                            }}
                          >
                            {stage.name}
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                      <User className="h-3 w-3" /> {nameOf(c.assigned_to)}
                    </div>
                    <div className="mt-4 pt-3 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                      <NewSaleDialog clientId={c.id} clientName={c.name} onCreated={load} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ClientDetailDialog
        clientId={detailClient?.id ?? null}
        clientName={detailClient?.name ?? ""}
        clientPhone={detailClient?.phone}
        open={!!detailClient}
        onOpenChange={(v) => !v && setDetailClient(null)}
        profiles={profiles}
        defaultAssignee={detailClient?.assigned_to ?? null}
      />

      {closeTarget && (
        <ClientCloseDialog
          open={!!closeTarget}
          onOpenChange={(v) => !v && setCloseTarget(null)}
          clientId={closeTarget.client.id}
          clientName={closeTarget.client.name}
          targetStageId={closeTarget.stageId}
          targetStageName={closeTarget.stageName}
          mode={closeTarget.mode}
          assigneeId={closeTarget.client.assigned_to}
          onConfirmed={() => {
            setCloseTarget(null);
            load();
          }}
        />
      )}
    </AppShell>
  );
}
