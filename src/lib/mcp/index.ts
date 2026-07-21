import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDoctors from "./tools/list-doctors";
import listClients from "./tools/list-clients";
import listRoutineTasks from "./tools/list-routine-tasks";
import agendaByDate from "./tools/agenda-by-date";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "rotina-pro-alivi-mcp",
  title: "Rotina Pro Alivi — MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas de leitura sobre a operação da clínica Alivi: agenda clínica, profissionais, clientes/pacientes e tarefas de rotina. Todas as chamadas rodam com a identidade do usuário autenticado (RLS aplicada).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listDoctors, listClients, listRoutineTasks, agendaByDate],
});
