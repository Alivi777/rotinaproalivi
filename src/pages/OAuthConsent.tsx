import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

// Typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthDetails = {
  client?: { name?: string; redirect_uri?: string } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
};
function oauthApi(): OAuthApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.auth as any).oauth as OAuthApi;
}

function isSameOriginRelative(path: string): boolean {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Parâmetro authorization_id ausente na URL.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message);
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao carregar a autorização.");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve
        ? await oauthApi().approveAuthorization(authorizationId)
        : await oauthApi().denyAuthorization(authorizationId);
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setError("O servidor de autorização não retornou um redirect.");
        setBusy(false);
        return;
      }
      window.location.href = target;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao processar a decisão.");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md p-6 space-y-3">
          <h1 className="text-lg font-semibold">Não foi possível carregar a autorização</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando autorização…
        </div>
      </main>
    );
  }

  const clientName = details.client?.name ?? "um aplicativo";
  const redirectUri = details.client?.redirect_uri;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-glow">
      <Card className="w-full max-w-md p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Conectar {clientName} ao Rotina Pro</h1>
            <p className="text-xs text-muted-foreground">Isto permite que {clientName} use este app como você.</p>
          </div>
        </div>

        <div className="text-sm space-y-2">
          <p>Ao aprovar, {clientName} poderá chamar as ferramentas habilitadas deste app enquanto você estiver conectado.</p>
          {redirectUri && (
            <p className="text-xs text-muted-foreground break-all">Redirect: {redirectUri}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Esta autorização não ignora as permissões nem as políticas de segurança do app.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => decide(true)} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aprovar
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => decide(false)} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </Card>
    </main>
  );
}

export { isSameOriginRelative };
