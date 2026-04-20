import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Block = {
  time: string;
  block: string;
  goal: string;
  highlight?: boolean;
};

const TATICAL: Block[] = [
  { time: "08:00–09:10", block: "Alinhamento e revisão", goal: "Revisar ontem, conduzir reunião, fechar missão e ajustar o começo do dia." },
  { time: "09:10–09:20", block: "Transição", goal: "Margem curta para deslocamento, água, banheiro e preparação do bloco seguinte." },
  { time: "09:20–11:40", block: "Missão principal", goal: "Bloco mais protegido do dia; execução da entrega de maior impacto.", highlight: true },
  { time: "11:40–12:00", block: "Pausa / margem", goal: "Respiro, absorção de atraso e reentrada organizada." },
  { time: "12:00–13:10", block: "Secundária 1", goal: "Primeira frente importante abaixo da missão principal." },
  { time: "13:10–13:20", block: "Transição", goal: "Troca de contexto com margem curta." },
  { time: "13:20–14:30", block: "Secundária 2", goal: "Segunda frente importante do dia." },
  { time: "14:30–14:45", block: "Pausa / margem", goal: "Ajuste fino da agenda e recuperação de ritmo." },
  { time: "14:45–15:20", block: "Tático curto 1", goal: "Admin leve, respostas controladas, follow-up curto ou checagem rápida." },
  { time: "15:20–15:25", block: "Transição", goal: "Margem curta para encerramento do bloco." },
  { time: "15:25–16:00", block: "Tático curto 2", goal: "Revisão do dia, preparação do amanhã, delegação e fechamento." },
];

const OPERATIONAL: Block[] = [
  { time: "08:00–08:35", block: "Alinhamento e revisão", goal: "Abertura curta para direção mínima, revisão rápida e priorização do começo do dia." },
  { time: "08:35–08:45", block: "Transição", goal: "Margem curta para preparação do bloco mais longo." },
  { time: "08:45–11:40", block: "Missão principal", goal: "Bloco estendido para execução, produção ou implantação de maior peso.", highlight: true },
  { time: "11:40–12:00", block: "Pausa / margem", goal: "Respiro e absorção de atraso sem quebrar a cadência do dia." },
  { time: "12:00–13:45", block: "Secundária 1", goal: "Segunda frente com mais tração do que no modelo tático." },
  { time: "13:45–13:55", block: "Transição", goal: "Troca de contexto com reorganização curta." },
  { time: "13:55–15:05", block: "Secundária 2", goal: "Terceira frente relevante sem fragmentar excessivamente o dia." },
  { time: "15:05–15:25", block: "Pausa / margem", goal: "Recuperação, água, banheiro e ajuste de pendências." },
  { time: "15:25–16:00", block: "Tático / fechamento", goal: "Admin essencial, revisão curta e preparação do próximo dia." },
];

function BlockList({ blocks }: { blocks: Block[] }) {
  return (
    <ul className="divide-y divide-border/50">
      {blocks.map((b, i) => (
        <li
          key={i}
          className={cn(
            "py-2.5 grid grid-cols-[110px_1fr] gap-3 items-start",
            b.highlight && "bg-primary/5 -mx-3 px-3 rounded"
          )}
        >
          <div className="text-xs font-mono text-muted-foreground tabular-nums pt-0.5">
            {b.time}
          </div>
          <div>
            <div className={cn("text-sm font-medium", b.highlight && "text-primary")}>
              {b.block}
            </div>
            <div className="text-xs text-muted-foreground">{b.goal}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function StandardAgendaCard({
  defaultMethod = "tatico",
}: {
  defaultMethod?: "tatico" | "operacional";
}) {
  return (
    <Card className="p-5 bg-card border-border/50">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Agenda padrão</h2>
        <span className="text-xs text-muted-foreground">
          referência — pode ser adaptada sem quebrar a lógica
        </span>
      </div>
      <Tabs defaultValue={defaultMethod}>
        <TabsList>
          <TabsTrigger value="tatico">Método tático</TabsTrigger>
          <TabsTrigger value="operacional">Método operacional</TabsTrigger>
        </TabsList>
        <TabsContent value="tatico" className="mt-4">
          <BlockList blocks={TATICAL} />
        </TabsContent>
        <TabsContent value="operacional" className="mt-4">
          <BlockList blocks={OPERATIONAL} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
