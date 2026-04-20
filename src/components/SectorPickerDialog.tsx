import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProfile, useSectors } from "@/lib/useProfile";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SectorPickerDialog() {
  const { user } = useAuth();
  const { profile, loading, reload } = useProfile();
  const { sectors } = useSectors();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && profile && !profile.sector_id) {
      setOpen(true);
    }
  }, [loading, profile]);

  async function save() {
    if (!picked || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ sector_id: picked })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Setor definido!");
    setOpen(false);
    reload();
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Bem-vindo! Em qual setor você atua?</DialogTitle>
          <DialogDescription>
            Sua rotina diária será baseada no setor selecionado. Você poderá alterar depois.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
          {sectors.map((s) => (
            <button
              key={s.id}
              onClick={() => setPicked(s.id)}
              className={cn(
                "p-4 rounded-lg border text-left transition-smooth",
                picked === s.id
                  ? "border-primary bg-primary/10 shadow-glow"
                  : "border-border bg-card hover:border-primary/40"
              )}
            >
              <div className="font-semibold">{s.name}</div>
              {s.icon && <div className="text-2xl mt-1">{s.icon}</div>}
            </button>
          ))}
        </div>
        <Button disabled={!picked || saving} onClick={save} className="w-full mt-2">
          {saving ? "Salvando..." : "Confirmar setor"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
