import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Users,
  MessageSquareText,
  LogOut,
  ListChecks,
  LayoutDashboard,
  FileText,
  ShieldCheck,
  Crosshair,
  MessageCircle,
  ClipboardList,
  Contact as ContactIcon,
  CalendarRange,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { usePendingPriorities } from "@/lib/usePendingPriorities";
import { cn } from "@/lib/utils";
import SectorPickerDialog from "./SectorPickerDialog";
import { usePendingAttendances } from "@/lib/usePendingAttendances";

const baseNav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/rotina", label: "Rotina", icon: ListChecks },
  { to: "/prioridades", label: "Prioridades", icon: Crosshair },
  { to: "/feedbacks", label: "Feedbacks", icon: MessageCircle },
  { to: "/agenda-clinica", label: "Agenda Clínica", icon: CalendarRange },
  { to: "/clientes", label: "Funis de Execução", icon: Users },
  { to: "/contatos", label: "Contatos", icon: ContactIcon },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageSquareText },
  { to: "/relatorio", label: "Relatório", icon: FileText },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { count: pendingPriorities } = usePendingPriorities();
  // Global subscription so toast+beep happens on any page
  usePendingAttendances();
  const nav = isAdmin
    ? [
        ...baseNav,
        { to: "/planejamento", label: "Planejamento", icon: ClipboardList, end: false },
        { to: "/admin", label: "Admin", icon: ShieldCheck, end: false },
      ]
    : baseNav;

  async function logout() {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:flex w-64 flex-col border-r border-sidebar-border bg-sidebar p-5">
        <div className="flex items-center gap-3 mb-10">
          <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
            <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold tracking-tight">Rotina Pro</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Painel do time
            </div>
          </div>
        </div>

        <nav className="space-y-1 flex-1">
          {nav.map((item) => {
            const showBadge =
              isAdmin &&
              pendingPriorities > 0 &&
              (item.to === "/admin" || item.to === "/prioridades");
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-smooth",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <Badge
                    variant="destructive"
                    className="h-5 min-w-5 px-1.5 text-[10px] font-bold animate-pulse-slow"
                  >
                    {pendingPriorities}
                  </Badge>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border pt-4 space-y-3">
          <div className="px-3">
            <div className="text-xs text-muted-foreground">Logado como</div>
            <div className="text-sm font-medium truncate">{user?.email}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-14 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold">Rotina Pro</span>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <main className="flex-1 lg:p-8 p-4 pt-20 lg:pt-8 max-w-[1400px]">
        <div className="lg:hidden mb-4 flex gap-2 overflow-x-auto">
          {nav.map((item) => {
            const showBadge =
              isAdmin &&
              pendingPriorities > 0 &&
              (item.to === "/admin" || item.to === "/prioridades");
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-smooth",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {showBadge && (
                  <Badge
                    variant="destructive"
                    className="h-4 min-w-4 px-1 text-[10px] font-bold animate-pulse-slow"
                  >
                    {pendingPriorities}
                  </Badge>
                )}
              </NavLink>
            );
          })}
        </div>
        {children}
      </main>
      <SectorPickerDialog />
    </div>
  );
}
