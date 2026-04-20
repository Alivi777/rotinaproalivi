import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSectors } from "@/lib/useProfile";
import {
  parseFile,
  downloadCsvTemplate,
  type ParsedContact,
} from "@/lib/contactCsv";
import { Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
};

export default function ContactImportDialog({ open, onOpenChange, onDone }: Props) {
  const { user } = useAuth();
  const { sectors } = useSectors();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedContact[]>([]);
  const [defaultSector, setDefaultSector] = useState<string>("");
  const [importing, setImporting] = useState(false);

  async function handleFile(f: File | null) {
    setFile(f);
    setParsed([]);
    if (!f) return;
    try {
      const rows = await parseFile(f);
      setParsed(rows);
      toast({
        title: `${rows.length} linhas lidas`,
        description: `${rows.filter((r) => r._errors.length === 0).length} válidas, ${rows.filter((r) => r._errors.length > 0).length} com erro`,
      });
    } catch (e: unknown) {
      toast({
        title: "Erro ao ler arquivo",
        description: e instanceof Error ? e.message : "Formato inválido",
        variant: "destructive",
      });
    }
  }

  async function doImport() {
    if (!user || !parsed.length) return;
    setImporting(true);

    const valid = parsed.filter((r) => r._errors.length === 0);
    const errorsCount = parsed.length - valid.length;

    // Create import record
    const { data: imp, error: impErr } = await supabase
      .from("contact_imports")
      .insert({
        imported_by: user.id,
        file_name: file?.name ?? null,
        total_rows: parsed.length,
        error_count: errorsCount,
        default_sector_id: defaultSector || null,
        status: "running",
      })
      .select()
      .single();

    if (impErr || !imp) {
      toast({ title: "Erro ao iniciar importação", description: impErr?.message, variant: "destructive" });
      setImporting(false);
      return;
    }

    let created = 0;
    let updated = 0;
    const batchSize = 500;

    for (let i = 0; i < valid.length; i += batchSize) {
      const batch = valid.slice(i, i + batchSize).map((r) => ({
        external_id: r.external_id || null,
        name: r.name,
        phone: r.phone || null,
        email: r.email || null,
        cpf: r.cpf || null,
        birth_date: r.birth_date || null,
        address: r.address || null,
        city: r.city || null,
        state: r.state || null,
        zip_code: r.zip_code || null,
        last_appointment_at: r.last_appointment_at || null,
        tags: r.tags || [],
        notes: r.notes || null,
        sector_id: defaultSector || null,
        source: "clinicorp",
        imported_at: new Date().toISOString(),
        import_id: imp.id,
        created_by: user.id,
      }));

      // Try upsert by external_id first, then cpf-based fallback handled by unique indexes.
      const withExt = batch.filter((b) => b.external_id);
      const withoutExt = batch.filter((b) => !b.external_id);

      if (withExt.length) {
        const { error, count } = await supabase
          .from("contacts")
          .upsert(withExt, { onConflict: "external_id", count: "exact" });
        if (error) {
          toast({ title: "Erro lote", description: error.message, variant: "destructive" });
        } else {
          created += count ?? withExt.length;
        }
      }
      if (withoutExt.length) {
        const withCpf = withoutExt.filter((b) => b.cpf);
        const noKey = withoutExt.filter((b) => !b.cpf);
        if (withCpf.length) {
          const { error, count } = await supabase
            .from("contacts")
            .upsert(withCpf, { onConflict: "cpf", count: "exact" });
          if (error) {
            toast({ title: "Erro CPF", description: error.message, variant: "destructive" });
          } else {
            updated += count ?? withCpf.length;
          }
        }
        if (noKey.length) {
          const { error, count } = await supabase
            .from("contacts")
            .insert(noKey, { count: "exact" });
          if (error) {
            toast({ title: "Erro insert", description: error.message, variant: "destructive" });
          } else {
            created += count ?? noKey.length;
          }
        }
      }
    }

    await supabase
      .from("contact_imports")
      .update({
        status: "done",
        created_count: created,
        updated_count: updated,
      })
      .eq("id", imp.id);

    toast({
      title: "Importação concluída",
      description: `${created} criados · ${updated} atualizados · ${errorsCount} erros`,
    });
    setImporting(false);
    setFile(null);
    setParsed([]);
    onDone();
    onOpenChange(false);
  }

  const validRows = parsed.filter((r) => r._errors.length === 0);
  const errorRows = parsed.filter((r) => r._errors.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar contatos do Clinicorp</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Não tem o arquivo no formato certo?</p>
                <p className="text-xs text-muted-foreground">
                  Baixe o modelo, preencha e suba aqui.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Modelo CSV
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Arquivo CSV ou XLSX</Label>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-2">
            <Label>Setor padrão dos contatos</Label>
            <Select value={defaultSector} onValueChange={setDefaultSector}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Define quem pode visualizar estes contatos (apenas usuários do mesmo
              setor + admins).
            </p>
          </div>

          {parsed.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {validRows.length} válidos
                </Badge>
                {errorRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {errorRows.length} com erro
                  </Badge>
                )}
              </div>

              {errorRows.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium mb-2">Linhas com erro (não serão importadas):</p>
                  <ul className="text-xs space-y-1">
                    {errorRows.slice(0, 20).map((r) => (
                      <li key={r._row}>
                        Linha {r._row}: {r.name || "(sem nome)"} — {r._errors.join(", ")}
                      </li>
                    ))}
                    {errorRows.length > 20 && (
                      <li className="text-muted-foreground">
                        … e mais {errorRows.length - 20} linhas
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="rounded-md border p-3 max-h-60 overflow-y-auto">
                <p className="text-xs font-medium mb-2">Pré-visualização (5 primeiras):</p>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left pb-1">Nome</th>
                      <th className="text-left pb-1">Telefone</th>
                      <th className="text-left pb-1">CPF</th>
                      <th className="text-left pb-1">E-mail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 5).map((r) => (
                      <tr key={r._row} className="border-t">
                        <td className="py-1">{r.name}</td>
                        <td>{r.phone || "—"}</td>
                        <td>{r.cpf || "—"}</td>
                        <td>{r.email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button
            onClick={doImport}
            disabled={!validRows.length || !defaultSector || importing}
          >
            <Upload className="h-4 w-4 mr-2" />
            {importing ? "Importando…" : `Importar ${validRows.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
