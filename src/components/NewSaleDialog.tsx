import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type PaymentMethod = { id: string; name: string };

export default function NewSaleDialog({
  clientId,
  clientName,
  onCreated,
}: {
  clientId: string;
  clientName: string;
  onCreated?: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("0");
  const [methodId, setMethodId] = useState<string>("");
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("payment_methods")
      .select("id, name")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setMethods(data as PaymentMethod[]);
      });
  }, [open]);

  async function save() {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("sales").insert({
      client_id: clientId,
      amount: parseFloat(amount),
      cost: parseFloat(cost) || 0,
      payment_method_id: methodId || null,
      is_new_patient: isNewPatient,
      description: description.trim() || null,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Venda registrada!");
    setAmount("");
    setCost("0");
    setMethodId("");
    setIsNewPatient(false);
    setDescription("");
    setOpen(false);
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <DollarSign className="h-3.5 w-3.5 mr-1" /> Nova venda
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar venda · {clientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Custo (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Forma de pagamento</Label>
            <Select value={methodId} onValueChange={setMethodId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Procedimento, produto..."
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div>
              <Label className="text-sm font-medium">Novo paciente</Label>
              <p className="text-xs text-muted-foreground">
                Conta para a meta de novos pacientes do mês
              </p>
            </div>
            <Switch checked={isNewPatient} onCheckedChange={setIsNewPatient} />
          </div>
          <Button onClick={save} disabled={saving} className="w-full">
            <Plus className="h-4 w-4 mr-1" />
            {saving ? "Salvando..." : "Registrar venda"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
