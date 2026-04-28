import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  Search,
  Upload,
  ExternalLink,
  Send,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { useContacts } from "@/lib/useContacts";
import { useSectors, useProfile } from "@/lib/useProfile";
import { useIsAdmin } from "@/lib/useIsAdmin";
import ContactImportDialog from "@/components/ContactImportDialog";
import ClinicorpSyncDialog from "@/components/ClinicorpSyncDialog";
import { toast } from "@/hooks/use-toast";
import { openWhatsappWeb } from "@/lib/whatsapp";

export default function ContactsPage() {
  const { isAdmin } = useIsAdmin();
  const { profile } = useProfile();
  const { sectors } = useSectors();
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  const sectorId = useMemo(() => {
    if (sectorFilter === "all") return null;
    if (sectorFilter === "mine") return profile?.sector_id ?? null;
    return sectorFilter;
  }, [sectorFilter, profile]);

  const { data, count, loading, reload, pageSize } = useContacts({
    search,
    sectorId,
    page,
    pageSize: 50,
  });

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  function openWaWeb(phone: string | null) {
    const ok = openWhatsappWeb(phone);
    if (!ok) {
      toast({ title: "Telefone não cadastrado", variant: "destructive" });
    }
  }

  function sendViaSystem() {
    toast({
      title: "Em breve",
      description: "Disponível após conectar Meta Cloud / Evolution API.",
    });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Base de contatos</h1>
            <p className="text-sm text-muted-foreground">
              Pacientes importados do Clinicorp · {count} contatos
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => reload()}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            {isAdmin && (
              <>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar CSV
                </Button>
                <Button onClick={() => setSyncOpen(true)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sincronizar Clinicorp
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Buscar e filtrar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome, telefone, CPF ou e-mail"
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
              />
            </div>
            <Select
              value={sectorFilter}
              onValueChange={(v) => {
                setPage(1);
                setSectorFilter(v);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os setores visíveis</SelectItem>
                {profile?.sector_id && (
                  <SelectItem value="mine">Meu setor</SelectItem>
                )}
                {isAdmin &&
                  sectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="hidden md:table-cell">E-mail</TableHead>
                  <TableHead className="hidden lg:table-cell">CPF</TableHead>
                  <TableHead className="hidden xl:table-cell">Última consulta</TableHead>
                  <TableHead className="hidden lg:table-cell">Tags</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum contato encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.phone || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        {c.email || "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-xs">
                        {c.cpf || "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs">
                        {c.last_appointment_at
                          ? new Date(c.last_appointment_at).toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(c.tags ?? []).slice(0, 3).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px]">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="default" className="gap-1">
                              <MessageSquare className="h-3.5 w-3.5" />
                              WhatsApp
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openWaWeb(c.phone)}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Abrir no meu WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={sendViaSystem}>
                              <Send className="h-4 w-4 mr-2" />
                              Enviar pelo sistema
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      <ContactImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={reload}
      />
      <ClinicorpSyncDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        onDone={reload}
      />
    </AppShell>
  );
}
