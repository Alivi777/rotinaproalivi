import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_clients",
  title: "Listar clientes/pacientes",
  description:
    "Retorna os clientes/pacientes cadastrados, filtrando opcionalmente por nome. Limite máximo 100.",
  inputSchema: {
    search: z.string().nullable().describe("Filtro opcional por nome do cliente"),
    limit: z.number().int().min(1).max(100).nullable().describe("Máximo de resultados (padrão 50)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const take = limit ?? 50;
    let query = supabase.from("clients").select("id, name, phone, assigned_to").limit(take);
    if (search && search.trim().length > 0) {
      query = query.ilike("name", `%${search.trim()}%`);
    }
    const { data, error } = await query.order("name");
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `${data?.length ?? 0} clientes encontrados` }],
      structuredContent: { clients: data ?? [] },
    };
  },
});
