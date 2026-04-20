import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSectors } from "@/lib/useProfile";
import { Users, Plus, Mail, ShieldCheck, ShieldOff, UserCog } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TeamMember = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  sector_id: string | null;
  is_active: boolean;
};

type Role = { user_id: string; role: string };

export default function TeamAdminPanel() {
  const { sectors } = useSectors();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", display_name: "", sector_id: "" });

  async function load() {
    const [p, r] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, display_name, email, sector_id, is_active")
        .order("display_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (p.data) setMembers(p.data as TeamMember[]);
    if (r.data) setRoles(r.data as Role[]);
  }

  useEffect(() => {
    load();
  }, []);

  const isAdmin = (uid: string) => roles.some((r) => r.user_id === uid && r.role === "admin");

  async function invite() {
    if (!form.email.trim() || !form.display_name.trim() || !form.sector_id) {
      return toast.error("Preencha nome, e-mail e setor.");
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-invite-user", {
      body: {
        email: form.email.trim().toLowerCase(),
        display_name: form.display_name.trim(),
        sector_id: form.sector_id,
      },
    });
    setBusy(false);
    if (error || (data && (data as any).error)) {
      return toast.error((data as any)?.error ?? error?.message ?? "Falha ao convidar");
    }
    toast.success("Convite enviado por e-mail.");
    setForm({ email: "", display_name: "", sector_id: "" });
    setOpen(false);
    load();
  }

  async function toggleActive(m: TeamMember) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !m.is_active })
      .eq("user_id", m.user_id);
    if (error) return toast.error(error.message);
    toast.success(m.is_active ? "Usuário desativado" : "Usuário reativado");
    load();
  }

  async function changeSector(m: TeamMember, sectorId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ sector_id: sectorId })
      .eq("user_id", m.user_id);
    if (error) return toast.error(error.message);
    toast.success("Setor atualizado");
    load();
  }

  async function toggleAdmin(m: TeamMember) {
    if (isAdmin(m.user_id)) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", m.user_id)
        .eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Admin removido");
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: m.user_id, role: "admin" });
      if (error) return toast.error(error.message);
      toast.success("Promovido a admin");
    }
    load();
  }

  return (
    <Card className="p-6 bg-card border-border/50">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Equipe</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Convide colaboradores por e-mail, atribua o setor, ative/desative acesso e
            promova administradores.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Convidar colaborador
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo colaborador</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={form.display_name}
                  onChange={(e) =>
                    setForm({ ...form, display_name: e.target.value })
                  }
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@dominio.com"
                />
              </div>
              <div>
                <Label>Setor</Label>
                <Select
                  value={form.sector_id}
                  onValueChange={(v) => setForm({ ...form, sector_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
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
              <Button onClick={invite} disabled={busy} className="w-full gap-2">
                <Mail className="h-4 w-4" />
                {busy ? "Enviando..." : "Enviar convite por e-mail"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum membro ainda.</p>
        )}
        {members.map((m) => {
          const admin = isAdmin(m.user_id);
          return (
            <div
              key={m.user_id}
              className={cn(
                "p-3 rounded-lg border flex flex-wrap items-center gap-3",
                m.is_active
                  ? "border-border/50 bg-background/40"
                  : "border-destructive/30 bg-destructive/5 opacity-70"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {m.display_name || "Sem nome"}
                  </span>
                  {admin && (
                    <Badge variant="default" className="gap-1 text-[10px]">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </Badge>
                  )}
                  {!m.is_active && (
                    <Badge variant="destructive" className="text-[10px]">
                      Inativo
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              </div>

              <Select
                value={m.sector_id ?? ""}
                onValueChange={(v) => changeSector(m, v)}
              >
                <SelectTrigger className="w-44 h-9">
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

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => toggleAdmin(m)}
              >
                {admin ? (
                  <>
                    <ShieldOff className="h-3.5 w-3.5" /> Remover admin
                  </>
                ) : (
                  <>
                    <UserCog className="h-3.5 w-3.5" /> Tornar admin
                  </>
                )}
              </Button>

              <div className="flex items-center gap-2">
                <Switch
                  checked={m.is_active}
                  onCheckedChange={() => toggleActive(m)}
                />
                <span className="text-xs text-muted-foreground">
                  {m.is_active ? "Ativo" : "Inativo"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
