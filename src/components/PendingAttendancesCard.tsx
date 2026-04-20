import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { usePendingAttendances, PendingAttendance } from "@/lib/usePendingAttendances";
import { Phone, ArrowRightLeft, CheckCircle2, AlarmClock } from "lucide-react";

type Profile = { user_id: string; display_name: string | null };

export default function PendingAttendancesCard() {
  const { items, markAttended, transfer } = usePendingAttendances();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [transferring, setTransferring] = useState<PendingAttendance | null>(null);
  const [toUser, setToUser] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("is_active", true)
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, []);

  if (items.length === 0) return null;

  return (
    <>
      <Card className="p-5 mb-6 border-destructive/40 bg-destructive/5">
        <div className="flex items-center gap-2 mb-3">
          <AlarmClock className="h-5 w-5 text-destructive animate-pulse" />
          <h2 className="font-semibold">
            {items.length} {items.length === 1 ? "atendimento aguardando" : "atendimentos aguardando"}
          </h2>
          <Badge variant="destructive" className="ml-auto">Você</Badge>
        </div>
        <ul className="space-y-2">
          {items.map((it) => {
            const waitMin = Math.round(
              (Date.now() - new Date(it.last_message_at).getTime()) / 60000,
            );
            return (
              <li
                key={it.id}
                className="flex items-center gap-3 flex-wrap p-3 rounded-lg bg-background border border-border/40"
              >
                <div className="flex-1 min-w-40">
                  <div className="font-medium text-sm">
                    {it.from_name || "Sem nome"}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {it.from_phone} · há {waitMin} min
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTransferring(it);
                    setToUser("");
                    setNote("");
                  }}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-1" /> Transferir
                </Button>
                <Button size="sm" onClick={() => markAttended(it.id)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Atendido
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Dialog open={!!transferring} onOpenChange={(o) => !o && setTransferring(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir conversa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Transferir para</Label>
              <Select value={toUser} onValueChange={setToUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {profiles
                    .slice()
                    .sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""))
                    .map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.display_name || "Sem nome"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Contexto rápido para quem vai assumir"
              />
            </div>
            <Button
              className="w-full"
              disabled={!toUser}
              onClick={async () => {
                if (transferring && toUser) {
                  await transfer(transferring.id, toUser, note || undefined);
                  setTransferring(null);
                }
              }}
            >
              Transferir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
