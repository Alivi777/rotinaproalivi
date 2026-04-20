import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const { profile, loading: pLoading } = useProfile();

  // Force-logout on access if profile is inactive
  useEffect(() => {
    if (profile && profile.is_active === false) {
      // keep them on screen long enough to see the message; manual click logs out
    }
  }, [profile]);

  if (loading || pLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  if (profile && profile.is_active === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-destructive/15 flex items-center justify-center">
            <ShieldOff className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Acesso suspenso</h1>
          <p className="text-muted-foreground">
            Sua conta foi desativada pelo administrador. Entre em contato com o
            gestor para reativá-la.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return children;
}
