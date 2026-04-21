import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Plus, Stethoscope } from "lucide-react";

type Doctor = {
  id: string;
  external_id: string | null;
  name: string;
  assigned_user_id: string | null;
  color: string | null;
  active: boolean;
  name_locked?: boolean;
};
...
                <Input
                  value={d.name}
                  onChange={(e) =>
                    setDoctors((arr) => arr.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)))
                  }
                  onBlur={(e) => e.target.value !== d.name && update(d.id, { name: e.target.value, name_locked: true })}
                  className="flex-1 min-w-[150px]"
                />
                <Select
                  value={d.assigned_user_id ?? "none"}
                  onValueChange={(v) => update(d.id, { assigned_user_id: v === "none" ? null : v })}
                >
...
                <div className="flex items-center gap-2">
                  <Switch
                    checked={d.active}
                    onCheckedChange={(v) => update(d.id, { active: v })}
                  />
                  <span className="text-xs text-muted-foreground">Ativo</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!d.name_locked}
                    onCheckedChange={(v) => update(d.id, { name_locked: v })}
                  />
                  <span className="text-xs text-muted-foreground">Nome travado</span>
                </div>
                {d.external_id && (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs font-semibold text-primary">
                      {counts.get(d.external_id) || 0} consultas (30d)
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      ID: {d.external_id}
                    </span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
