import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { useProfile, useSectors } from "@/lib/useProfile";
import { spToday } from "@/lib/spTime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Clock, Coffee, LogIn, LogOut, FileDown, FileText, AlertCircle, Check, X, Pencil } from "lucide-react";

type Entry = {
  id: string;
  user_id: string;
  entry_date: string;
  clock_in: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  clock_out: string | null;
  notes: string | null;
  edited_by: string | null;
  edited_at: string | null;
  edit_reason: string | null;
};

type Profile = { user_id: string; display_name: string | null; email: string | null };

type CorrectionRequest = {
  id: string;
  entry_id: string | null;
  user_id: string;
  entry_date: string;
  requested_clock_in: string | null;
  requested_lunch_start: string | null;
  requested_lunch_end: string | null;
  requested_clock_out: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  clock_in: "Entrada",
  lunch_start: "Início almoço",
  lunch_end: "Fim almoço",
  clock_out: "Saída",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function durationMinutes(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function workedMinutes(e: Entry) {
  if (!e.clock_in || !e.clock_out) return 0;
  const total = durationMinutes(e.clock_in, e.clock_out);
  const lunch = durationMinutes(e.lunch_start, e.lunch_end);
  return Math.max(0, total - lunch);
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function monthRange(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function currentMonth() {
  const t = spToday(); // YYYY-MM-DD
  return t.slice(0, 7);
}

export default function PontoPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  return (
    <AppShell>
      <div className="container py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Clock className="h-6 w-6" /> Ponto</h1>
          <p className="text-muted-foreground text-sm">Bata o ponto, acompanhe o mês e gere relatórios para fechamento.</p>
        </div>

        <Tabs defaultValue="hoje">
          <TabsList>
            <TabsTrigger value="hoje">Hoje</TabsTrigger>
            <TabsTrigger value="mes">Meu mês</TabsTrigger>
            <TabsTrigger value="correcoes">Solicitar correção</TabsTrigger>
            {isAdmin && <TabsTrigger value="admin">Admin</TabsTrigger>}
          </TabsList>

          <TabsContent value="hoje"><PunchCard userId={user?.id ?? ""} /></TabsContent>
          <TabsContent value="mes"><MyMonth userId={user?.id ?? ""} /></TabsContent>
          <TabsContent value="correcoes"><MyCorrections userId={user?.id ?? ""} /></TabsContent>
          {isAdmin && <TabsContent value="admin"><AdminPanel /></TabsContent>}
        </Tabs>
      </div>
    </AppShell>
  );
}

function PunchCard({ userId }: { userId: string }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const today = spToday();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("time_clock_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("entry_date", today)
      .maybeSingle();
    setEntry((data as Entry) ?? null);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  async function punch(field: "clock_in" | "lunch_start" | "lunch_end" | "clock_out") {
    if (!userId) return;
    const ts = new Date().toISOString();
    if (!entry) {
      const payload: any = { user_id: userId, entry_date: today };
      payload[field] = ts;
      const { data, error } = await supabase
        .from("time_clock_entries")
        .insert(payload)
        .select("*")
        .single();
      if (error) return toast.error(error.message);
      setEntry(data as Entry);
    } else {
      if ((entry as any)[field]) return toast.error("Esse ponto já foi registrado.");
      const upd: any = {}; upd[field] = ts;
      const { data, error } = await supabase
        .from("time_clock_entries")
        .update(upd)
        .eq("id", entry.id)
        .select("*")
        .single();
      if (error) return toast.error(error.message);
      setEntry(data as Entry);
    }
    toast.success(`${FIELD_LABELS[field]} registrada às ${fmtTime(ts)}`);
  }

  const worked = entry ? workedMinutes(entry) : 0;
  const onLunch = !!entry?.lunch_start && !entry?.lunch_end;
  const finished = !!entry?.clock_out;

  const items: Array<{ key: any; label: string; icon: any; value: string | null }> = [
    { key: "clock_in", label: "Entrada", icon: LogIn, value: entry?.clock_in ?? null },
    { key: "lunch_start", label: "Início almoço", icon: Coffee, value: entry?.lunch_start ?? null },
    { key: "lunch_end", label: "Fim almoço", icon: Coffee, value: entry?.lunch_end ?? null },
    { key: "clock_out", label: "Saída", icon: LogOut, value: entry?.clock_out ?? null },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{fmtDate(today)}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Hora atual: <span className="font-mono">{now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Trabalhado hoje</div>
            <div className="text-2xl font-semibold font-mono">{fmtDuration(worked)}</div>
            {onLunch && <Badge variant="secondary" className="mt-1">Em almoço</Badge>}
            {finished && <Badge className="mt-1">Encerrado</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map((it) => (
            <div key={it.key} className="rounded-lg border p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><it.icon className="h-4 w-4" /> {it.label}</div>
              <div className="font-mono text-lg">{fmtTime(it.value)}</div>
              <Button size="sm" disabled={!!it.value || loading} onClick={() => punch(it.key)}>
                {it.value ? "Registrado" : `Bater ${it.label.toLowerCase()}`}
              </Button>
            </div>
          ))}
        </div>
        {entry?.edited_by && (
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Pencil className="h-3 w-3" /> Ajustado pelo administrador {entry.edit_reason ? `— ${entry.edit_reason}` : ""}</p>
        )}
      </CardContent>
    </Card>
  );
}

function MyMonth({ userId }: { userId: string }) {
  const [month, setMonth] = useState(currentMonth());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const { start, end } = monthRange(month);
      const [{ data: rows }, { data: prof }] = await Promise.all([
        supabase.from("time_clock_entries").select("*").eq("user_id", userId).gte("entry_date", start).lte("entry_date", end).order("entry_date"),
        supabase.from("profiles").select("display_name,email").eq("user_id", userId).maybeSingle(),
      ]);
      setEntries((rows as Entry[]) ?? []);
      setName((prof as any)?.display_name || (prof as any)?.email || "Colaborador");
      setLoading(false);
    })();
  }, [userId, month]);

  const totalMin = useMemo(() => entries.reduce((acc, e) => acc + workedMinutes(e), 0), [entries]);

  function exportCSV() {
    const header = ["Data", "Entrada", "Início almoço", "Fim almoço", "Saída", "Trabalhado", "Observações", "Ajustado"];
    const lines = entries.map((e) => [
      fmtDate(e.entry_date),
      fmtTime(e.clock_in), fmtTime(e.lunch_start), fmtTime(e.lunch_end), fmtTime(e.clock_out),
      fmtDuration(workedMinutes(e)),
      (e.notes ?? "").replace(/\n/g, " "),
      e.edited_by ? "Sim" : "Não",
    ]);
    const csv = [header, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ponto-${name}-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: unknown) =>
      String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
      );
    const rows = entries.map((e) => `
      <tr>
        <td>${esc(fmtDate(e.entry_date))}</td>
        <td>${esc(fmtTime(e.clock_in))}</td>
        <td>${esc(fmtTime(e.lunch_start))}</td>
        <td>${esc(fmtTime(e.lunch_end))}</td>
        <td>${esc(fmtTime(e.clock_out))}</td>
        <td>${esc(fmtDuration(workedMinutes(e)))}</td>
        <td>${e.edited_by ? "Sim" : ""}</td>
      </tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Espelho de ponto ${esc(month)}</title>
      <style>body{font-family:Arial;padding:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:2px 0;color:#444}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px;text-align:center}th{background:#f3f4f6}
      tfoot td{font-weight:bold;background:#f9fafb}.sig{margin-top:60px;display:flex;gap:60px}.sig div{flex:1;border-top:1px solid #333;padding-top:6px;text-align:center;font-size:12px}</style>
      </head><body>
      <h1>Espelho de Ponto — ${esc(month)}</h1>
      <p><b>Colaborador:</b> ${esc(name)}</p>
      <p><b>Total trabalhado:</b> ${esc(fmtDuration(totalMin))}</p>
      <table><thead><tr><th>Data</th><th>Entrada</th><th>Início almoço</th><th>Fim almoço</th><th>Saída</th><th>Trabalhado</th><th>Ajustado</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5">Total</td><td>${esc(fmtDuration(totalMin))}</td><td></td></tr></tfoot></table>
      <div class="sig"><div>Assinatura do colaborador</div><div>Assinatura do gestor</div></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-3">
            <div>
              <Label>Mês de referência</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total trabalhado</div>
              <div className="text-xl font-semibold font-mono">{fmtDuration(totalMin)}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}><FileDown className="h-4 w-4 mr-2" />CSV</Button>
            <Button onClick={exportPDF}><FileText className="h-4 w-4 mr-2" />PDF</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground">
              <th className="py-2">Data</th><th>Entrada</th><th>Início almoço</th><th>Fim almoço</th><th>Saída</th><th>Trabalhado</th><th></th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Carregando…</td></tr>}
              {!loading && entries.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Sem registros neste mês.</td></tr>}
              {entries.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="py-2">{fmtDate(e.entry_date)}</td>
                  <td className="font-mono">{fmtTime(e.clock_in)}</td>
                  <td className="font-mono">{fmtTime(e.lunch_start)}</td>
                  <td className="font-mono">{fmtTime(e.lunch_end)}</td>
                  <td className="font-mono">{fmtTime(e.clock_out)}</td>
                  <td className="font-mono">{fmtDuration(workedMinutes(e))}</td>
                  <td>{e.edited_by && <Badge variant="secondary" className="text-xs">ajustado</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MyCorrections({ userId }: { userId: string }) {
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(spToday());
  const [reason, setReason] = useState("");
  const [vals, setVals] = useState<{ clock_in: string; lunch_start: string; lunch_end: string; clock_out: string }>({
    clock_in: "", lunch_start: "", lunch_end: "", clock_out: "",
  });

  async function load() {
    if (!userId) return;
    const { data } = await supabase.from("time_clock_correction_requests")
      .select("*").eq("user_id", userId).order("created_at", { ascending: false });
    setRequests((data as CorrectionRequest[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  function toIso(d: string, t: string) {
    if (!t) return null;
    return new Date(`${d}T${t}:00-03:00`).toISOString();
  }

  async function submit() {
    if (!reason.trim()) return toast.error("Informe o motivo da correção.");
    const payload = {
      user_id: userId, entry_date: date, reason: reason.trim(),
      requested_clock_in: toIso(date, vals.clock_in),
      requested_lunch_start: toIso(date, vals.lunch_start),
      requested_lunch_end: toIso(date, vals.lunch_end),
      requested_clock_out: toIso(date, vals.clock_out),
    };
    const { error } = await supabase.from("time_clock_correction_requests").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success("Solicitação enviada ao admin.");
    setOpen(false); setReason(""); setVals({ clock_in: "", lunch_start: "", lunch_end: "", clock_out: "" });
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Minhas solicitações</CardTitle>
        <Button onClick={() => setOpen(true)}>Nova solicitação</Button>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação até o momento.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="border rounded-lg p-3 text-sm">
                <div className="flex justify-between items-center">
                  <div className="font-medium">{fmtDate(r.entry_date)}</div>
                  <Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "destructive"}>
                    {r.status === "pending" ? "Pendente" : r.status === "approved" ? "Aprovada" : "Rejeitada"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{r.reason}</div>
                <div className="text-xs mt-1 font-mono">
                  Ent {fmtTime(r.requested_clock_in)} · Alm {fmtTime(r.requested_lunch_start)}–{fmtTime(r.requested_lunch_end)} · Saí {fmtTime(r.requested_clock_out)}
                </div>
                {r.review_note && <div className="text-xs mt-1">Resposta: {r.review_note}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitar correção de ponto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Entrada</Label><Input type="time" value={vals.clock_in} onChange={(e) => setVals({ ...vals, clock_in: e.target.value })} /></div>
              <div><Label>Saída</Label><Input type="time" value={vals.clock_out} onChange={(e) => setVals({ ...vals, clock_out: e.target.value })} /></div>
              <div><Label>Início almoço</Label><Input type="time" value={vals.lunch_start} onChange={(e) => setVals({ ...vals, lunch_start: e.target.value })} /></div>
              <div><Label>Fim almoço</Label><Input type="time" value={vals.lunch_end} onChange={(e) => setVals({ ...vals, lunch_end: e.target.value })} /></div>
            </div>
            <div><Label>Motivo</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explique o que precisa ser corrigido…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit}>Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AdminPanel() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);

  async function load() {
    const { start, end } = monthRange(month);
    const [{ data: profs }, entriesRes, reqRes] = await Promise.all([
      supabase.from("profiles").select("user_id,display_name,email").eq("is_active", true).order("display_name"),
      selectedUser === "all"
        ? supabase.from("time_clock_entries").select("*").gte("entry_date", start).lte("entry_date", end).order("entry_date")
        : supabase.from("time_clock_entries").select("*").eq("user_id", selectedUser).gte("entry_date", start).lte("entry_date", end).order("entry_date"),
      supabase.from("time_clock_correction_requests").select("*").eq("status", "pending").order("created_at"),
    ]);
    setProfiles((profs as Profile[]) ?? []);
    setEntries((entriesRes.data as Entry[]) ?? []);
    setRequests((reqRes.data as CorrectionRequest[]) ?? []);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month, selectedUser]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  async function reviewRequest(r: CorrectionRequest, approve: boolean, note: string) {
    if (approve) {
      // upsert entry with requested values
      const patch: any = { user_id: r.user_id, entry_date: r.entry_date };
      if (r.requested_clock_in) patch.clock_in = r.requested_clock_in;
      if (r.requested_lunch_start) patch.lunch_start = r.requested_lunch_start;
      if (r.requested_lunch_end) patch.lunch_end = r.requested_lunch_end;
      if (r.requested_clock_out) patch.clock_out = r.requested_clock_out;
      patch.edited_by = user?.id; patch.edited_at = new Date().toISOString(); patch.edit_reason = `Correção aprovada: ${r.reason}`;
      const { error } = await supabase.from("time_clock_entries").upsert(patch, { onConflict: "user_id,entry_date" });
      if (error) return toast.error(error.message);
    }
    const { error } = await supabase.from("time_clock_correction_requests")
      .update({ status: approve ? "approved" : "rejected", reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_note: note })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(approve ? "Solicitação aprovada" : "Solicitação rejeitada");
    load();
  }

  return (
    <div className="space-y-4">
      {requests.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5" />Solicitações pendentes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {requests.map((r) => (
              <ReqRow key={r.id} r={r} who={profileById.get(r.user_id)} onReview={reviewRequest} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3 items-end">
            <div><Label>Mês</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" /></div>
            <div className="min-w-56">
              <Label>Colaborador</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-2">Data</th><th>Colaborador</th><th>Entrada</th><th>Almoço</th><th>Saída</th><th>Trab.</th><th></th>
              </tr></thead>
              <tbody>
                {entries.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Sem registros.</td></tr>}
                {entries.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="py-2">{fmtDate(e.entry_date)}</td>
                    <td>{profileById.get(e.user_id)?.display_name || profileById.get(e.user_id)?.email || "—"}</td>
                    <td className="font-mono">{fmtTime(e.clock_in)}</td>
                    <td className="font-mono">{fmtTime(e.lunch_start)}–{fmtTime(e.lunch_end)}</td>
                    <td className="font-mono">{fmtTime(e.clock_out)}</td>
                    <td className="font-mono">{fmtDuration(workedMinutes(e))}</td>
                    <td><Button size="sm" variant="outline" onClick={() => setEditing(e)}><Pencil className="h-3 w-3 mr-1" />Editar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editing && <EditEntryDialog entry={editing} onClose={() => { setEditing(null); load(); }} adminId={user?.id ?? ""} />}
    </div>
  );
}

function ReqRow({ r, who, onReview }: { r: CorrectionRequest; who?: Profile; onReview: (r: CorrectionRequest, approve: boolean, note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="border rounded-lg p-3">
      <div className="flex justify-between items-center">
        <div>
          <div className="font-medium">{who?.display_name || who?.email || "—"} · {fmtDate(r.entry_date)}</div>
          <div className="text-xs text-muted-foreground">{r.reason}</div>
        </div>
        <div className="text-xs font-mono">
          Ent {fmtTime(r.requested_clock_in)} · Alm {fmtTime(r.requested_lunch_start)}–{fmtTime(r.requested_lunch_end)} · Saí {fmtTime(r.requested_clock_out)}
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <Input placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" onClick={() => onReview(r, true, note)}><Check className="h-4 w-4 mr-1" />Aprovar</Button>
        <Button size="sm" variant="destructive" onClick={() => onReview(r, false, note)}><X className="h-4 w-4 mr-1" />Rejeitar</Button>
      </div>
    </div>
  );
}

function timeOnly(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
  return fmt.format(d);
}

function EditEntryDialog({ entry, onClose, adminId }: { entry: Entry; onClose: () => void; adminId: string }) {
  const [vals, setVals] = useState({
    clock_in: timeOnly(entry.clock_in),
    lunch_start: timeOnly(entry.lunch_start),
    lunch_end: timeOnly(entry.lunch_end),
    clock_out: timeOnly(entry.clock_out),
  });
  const [reason, setReason] = useState("");

  function toIso(t: string) {
    if (!t) return null;
    return new Date(`${entry.entry_date}T${t}:00-03:00`).toISOString();
  }

  async function save() {
    if (!reason.trim()) return toast.error("Informe o motivo do ajuste.");
    const newVals: any = {
      clock_in: toIso(vals.clock_in),
      lunch_start: toIso(vals.lunch_start),
      lunch_end: toIso(vals.lunch_end),
      clock_out: toIso(vals.clock_out),
      edited_by: adminId,
      edited_at: new Date().toISOString(),
      edit_reason: reason.trim(),
    };
    // log changes
    const fields: Array<"clock_in" | "lunch_start" | "lunch_end" | "clock_out"> = ["clock_in", "lunch_start", "lunch_end", "clock_out"];
    const logs = fields
      .filter((f) => (entry[f] ?? null) !== (newVals[f] ?? null))
      .map((f) => ({ entry_id: entry.id, edited_by: adminId, field_name: f, old_value: entry[f], new_value: newVals[f], reason: reason.trim() }));
    const { error } = await supabase.from("time_clock_entries").update(newVals).eq("id", entry.id);
    if (error) return toast.error(error.message);
    if (logs.length) await supabase.from("time_clock_edit_log").insert(logs as any);
    toast.success("Ponto ajustado");
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar ponto · {fmtDate(entry.entry_date)}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Entrada</Label><Input type="time" value={vals.clock_in} onChange={(e) => setVals({ ...vals, clock_in: e.target.value })} /></div>
          <div><Label>Saída</Label><Input type="time" value={vals.clock_out} onChange={(e) => setVals({ ...vals, clock_out: e.target.value })} /></div>
          <div><Label>Início almoço</Label><Input type="time" value={vals.lunch_start} onChange={(e) => setVals({ ...vals, lunch_start: e.target.value })} /></div>
          <div><Label>Fim almoço</Label><Input type="time" value={vals.lunch_end} onChange={(e) => setVals({ ...vals, lunch_end: e.target.value })} /></div>
        </div>
        <div className="mt-2"><Label>Motivo do ajuste</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
