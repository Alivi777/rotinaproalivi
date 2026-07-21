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
  name: "get_agenda_by_date",
  title: "Consultar agenda clínica de um dia",
  description:
    "Retorna a agenda clínica (consultas) para uma data específica no formato YYYY-MM-DD (timezone America/Sao_Paulo).",
  inputSchema: {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Data no formato YYYY-MM-DD"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("clinic_appointments")
      .select("id, patient_name, doctor_external_id, start_time, end_time, status, appointment_type")
      .gte("start_time", `${date}T00:00:00-03:00`)
      .lte("start_time", `${date}T23:59:59-03:00`)
      .order("start_time");
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Encontrados ${data?.length ?? 0} agendamentos para ${date}` }],
      structuredContent: { date, appointments: data ?? [] },
    };
  },
});
