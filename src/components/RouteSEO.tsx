import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const BASE = "https://rotinaproalivi.lovable.app";

const META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Dashboard | Rotina Pro",
    description: "Visão geral do dia: tarefas, prioridades e indicadores do time em um só painel.",
  },
  "/rotina": {
    title: "Rotina do dia | Rotina Pro",
    description: "Checklist diário do time com tarefas, hábitos e acompanhamento de execução.",
  },
  "/prioridades": {
    title: "Prioridades | Rotina Pro",
    description: "Prioridades ativas do time, alertas e metas em andamento.",
  },
  "/feedbacks": {
    title: "Feedbacks | Rotina Pro",
    description: "Registro e acompanhamento de feedbacks entre líderes e colaboradores.",
  },
  "/agenda-clinica": {
    title: "Agenda Clínica | Rotina Pro",
    description: "Agendas dos profissionais da clínica em visão consolidada por dia.",
  },
  "/clientes": {
    title: "Funis de Execução | Rotina Pro",
    description: "Funis de execução por cliente: tarefas, etapas e responsáveis.",
  },
  "/contatos": {
    title: "Contatos | Rotina Pro",
    description: "Base de contatos da clínica com importação e busca rápida.",
  },
  "/whatsapp": {
    title: "WhatsApp | Rotina Pro",
    description: "Entradas do WhatsApp, atendimentos pendentes e tempo de resposta.",
  },
  "/gptmaker": {
    title: "GPT Maker | Rotina Pro",
    description: "Dashboard de conversas do GPT Maker: volume, taxa de resposta e principais clientes.",
  },
  "/relatorio": {
    title: "Relatório | Rotina Pro",
    description: "Relatórios consolidados de produtividade e operação do time.",
  },
  "/ponto": {
    title: "Ponto | Rotina Pro",
    description: "Registro de ponto e jornada dos colaboradores.",
  },
  "/planejamento": {
    title: "Planejamento | Rotina Pro",
    description: "Planejamento diário e semanal do gestor com missões e secundárias.",
  },
  "/admin": {
    title: "Admin | Rotina Pro",
    description: "Administração do time, setores, prioridades e configurações.",
  },
  "/gestor-ia": {
    title: "Gestor de Dados e IA | Rotina Pro",
    description: "Direcionamentos táticos com apoio de IA sobre os dados do time.",
  },
  "/auth": {
    title: "Login | Rotina Pro",
    description: "Acesse o Rotina Pro para gerenciar a rotina e operação do seu time.",
  },
  "/reset-password": {
    title: "Redefinir senha | Rotina Pro",
    description: "Defina uma nova senha para acessar o Rotina Pro.",
  },
};

const FALLBACK = {
  title: "Rotina Pro — Painel de operação do time",
  description: "Painel corporativo para rotina diária, clientes e operação do time.",
};

export default function RouteSEO() {
  const { pathname } = useLocation();
  const meta = META[pathname] ?? FALLBACK;
  const url = `${BASE}${pathname}`;
  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
    </Helmet>
  );
}
