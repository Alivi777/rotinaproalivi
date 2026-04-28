import AppShell from "@/components/AppShell";
import TacticalAIChat from "@/components/TacticalAIChat";

export default function GestorIAPage() {
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Gestor Tático IA</h1>
        <p className="text-muted-foreground mt-1">
          Seu copiloto: pergunta o que quiser sobre seus dados (vendas, prioridades, agenda, atendimentos).
        </p>
      </header>
      <div className="h-[calc(100vh-220px)] min-h-[500px]">
        <TacticalAIChat />
      </div>
    </AppShell>
  );
}
