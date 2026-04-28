import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import TacticalAIChat from "./TacticalAIChat";

export default function FloatingAIButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-gradient-primary shadow-glow",
          "flex items-center justify-center text-primary-foreground",
          "hover:scale-105 transition-all"
        )}
        aria-label="Abrir Gestor IA"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      {open && (
        <div
          className={cn(
            "fixed z-40 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden",
            "bottom-24 right-5",
            "w-[380px] h-[600px] max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-8rem)]",
            "flex flex-col"
          )}
        >
          <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-primary/10 to-transparent flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Gestor Tático IA</span>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <TacticalAIChat compact />
          </div>
        </div>
      )}
    </>
  );
}
