import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageCircle,
  Plus,
  FileDown,
  Pencil,
  Trash2,
  CheckCircle2,
  PenLine,
  FileSignature,
  Clock,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import FeedbackFormDialog from "@/components/FeedbackFormDialog";
import { exportFeedbackPdf, FeedbackRecord } from "@/lib/feedbackPdf";

type Profile = { user_id: string; display_name: string | null };
type Row = FeedbackRecord & { user_id: string; manager_id: string };

export default function FeedbacksPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [signing, setSigning] = useState<Row | null>(null);
  const [signResponse, setSignResponse] = useState("");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  async function load() {
    const [p, f] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, display_name")
        .eq("is_active", true)
        .order("display_name"),
      supabase
        .from("team_feedbacks")
        .select("*")
        .order("reference_date", { ascending: false }),
    ]);
    if (p.data) setProfiles(p.data as Profile[]);
    if (f.data) setItems(f.data as Row[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("feedbacks-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_feedbacks" },
        load
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const nameOf = (uid: string) =>
    profiles.find((p) => p.user_id === uid)?.display_name || "Sem nome";

  async function remove(id: string) {
    if (!confirm("Excluir este feedback?")) return;
    const { error } = await supabase
      .from("team_feedbacks")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Feedback removido");
    load();
  }

  async function signAsManager(fb: Row) {
    const { error } = await supabase
      .from("team_feedbacks")
      .update({
        manager_signed_at: new Date().toISOString(),
        manager_signature_name: nameOf(fb.manager_id),
      })
      .eq("id", fb.id);
    if (error) return toast.error(error.message);
    toast.success("Assinatura do gestor registrada");
    load();
  }

  async function confirmSign() {
    if (!signing) return;
    const { error } = await supabase
      .from("team_feedbacks")
      .update({
        collaborator_signed_at: new Date().toISOString(),
        collaborator_signature_name: nameOf(signing.user_id),
        collaborator_response: signResponse || signing.collaborator_response,
      })
      .eq("id", signing.id);
    if (error) return toast.error(error.message);
    toast.success("Recebido e assinado");
    setSigning(null);
    setSignResponse("");
    load();
  }

  return (
    <AppShell>
      <header className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
            <MessageCircle className="h-3.5 w-3.5" />
            Feedbacks do time
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
            {isAdmin ? "Contratos & Feedbacks semanais" : "Meus feedbacks"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isAdmin
              ? "Semana 1: contrato de expectativa · Semanas 2 a 4: feedback semanal de desenvolvimento."
              : "Acompanhe os feedbacks recebidos e assine para confirmar o aceite."}
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Novo feedback
          </Button>
        )}
      </header>

      {isAdmin && (
        <Card className="p-3 mb-4 bg-card border-border/50 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground block">
              Colaborador
            </label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm w-48"
            >
              <option value="all">Todos</option>
              {profiles.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.display_name || "Sem nome"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground block">
              De
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm w-36"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground block">
              Até
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm w-36"
            />
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {(() => {
          const filtered = items.filter((it) => {
            if (filterUser !== "all" && it.user_id !== filterUser) return false;
            if (fromDate && it.reference_date < fromDate) return false;
            if (toDate && it.reference_date > toDate) return false;
            return true;
          });
          if (filtered.length === 0) {
            return (
              <Card className="p-8 text-center bg-card border-border/50">
                <FileSignature className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {isAdmin
                    ? "Nenhum feedback no filtro selecionado."
                    : "Você ainda não recebeu feedbacks. Aguarde o gestor."}
                </p>
              </Card>
            );
          }
          return filtered.map((fb) => {
          const isContract = fb.feedback_type === "contract";
          const mineToSign = fb.user_id === user?.id && !fb.collaborator_signed_at;
          return (
            <Card
              key={fb.id}
              className={cn(
                "p-5 bg-card border-border/50",
                mineToSign && "border-destructive/40 bg-destructive/5"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge
                      variant={isContract ? "default" : "secondary"}
                      className="gap-1"
                    >
                      {isContract ? (
                        <FileSignature className="h-3 w-3" />
                      ) : (
                        <PenLine className="h-3 w-3" />
                      )}
                      {isContract ? "Contrato" : `Feedback · Semana ${fb.week_of_month}`}
                    </Badge>
                    <span className="text-sm font-semibold">
                      {nameOf(fb.user_id)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      por {nameOf(fb.manager_id)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(fb.reference_date).toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() =>
                      exportFeedbackPdf(fb, nameOf(fb.user_id), nameOf(fb.manager_id))
                    }
                  >
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </Button>
                  {isAdmin && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          setEditing(fb);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove(fb.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Quick body preview */}
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                {isContract ? (
                  <>
                    {fb.deliverables && (
                      <Snippet label="Entregáveis" text={fb.deliverables} />
                    )}
                    {fb.expected_behavior && (
                      <Snippet
                        label="Comportamento esperado"
                        text={fb.expected_behavior}
                      />
                    )}
                    {fb.non_negotiables && (
                      <Snippet label="Inegociáveis" text={fb.non_negotiables} />
                    )}
                  </>
                ) : (
                  <>
                    {fb.last_week_numbers && (
                      <Snippet
                        label="Números da semana"
                        text={fb.last_week_numbers}
                      />
                    )}
                    {fb.commitment_goal && (
                      <Snippet
                        label="Meta da semana"
                        text={fb.commitment_goal}
                      />
                    )}
                    {fb.needs_improvement && (
                      <Snippet
                        label="A aprimorar"
                        text={fb.needs_improvement}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Signature row */}
              <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center gap-3 justify-between">
                <div className="flex flex-wrap gap-3 text-xs">
                  <SignatureBadge
                    label="Gestor"
                    signed={!!fb.manager_signed_at}
                    name={fb.manager_signature_name}
                    at={fb.manager_signed_at}
                  />
                  <SignatureBadge
                    label="Colaborador"
                    signed={!!fb.collaborator_signed_at}
                    name={fb.collaborator_signature_name}
                    at={fb.collaborator_signed_at}
                  />
                </div>
                <div className="flex gap-2">
                  {isAdmin &&
                    user?.id === fb.manager_id &&
                    !fb.manager_signed_at && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5"
                        onClick={() => signAsManager(fb)}
                      >
                        <PenLine className="h-3.5 w-3.5" /> Assinar como gestor
                      </Button>
                    )}
                  {mineToSign && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        setSigning(fb);
                        setSignResponse(fb.collaborator_response || "");
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aceitar e assinar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        });
        })()}
      </div>

      {isAdmin && (
        <FeedbackFormDialog
          open={open}
          onOpenChange={setOpen}
          members={profiles}
          initial={editing}
          onSaved={load}
        />
      )}

      <Dialog open={!!signing} onOpenChange={(v) => !v && setSigning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aceitar e assinar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirme o recebimento do feedback. Você pode adicionar uma resposta
              ou questionamento abaixo (opcional).
            </p>
            <Textarea
              rows={5}
              value={signResponse}
              onChange={(e) => setSignResponse(e.target.value)}
              placeholder="Ex: Entendido, comprometido com a meta. Tenho dúvida sobre..."
            />
            <Button onClick={confirmSign} className="w-full gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Confirmar aceite e assinar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="p-2.5 rounded-md bg-background/40 border border-border/40">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </div>
      <p className="line-clamp-3 text-foreground/90">{text}</p>
    </div>
  );
}

function SignatureBadge({
  label,
  signed,
  name,
  at,
}: {
  label: string;
  signed: boolean;
  name: string | null;
  at: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {signed ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
      ) : (
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="font-medium">{label}:</span>
      <span className={cn(signed ? "text-foreground" : "text-muted-foreground")}>
        {signed
          ? `${name || "—"} · ${at ? new Date(at).toLocaleDateString("pt-BR") : ""}`
          : "pendente"}
      </span>
    </div>
  );
}
