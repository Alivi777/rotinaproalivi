// Sincroniza pacientes da agenda da semana corrente para o kanban de Clientes
// nos setores Recepção, Auditoria & Experiência e Sucesso do Cliente.
// Cria uma coluna por dia (Seg–Sáb) em cada setor e insere 1 card por
// agendamento em cada um dos 3 setores (sem deduplicação).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGET_SECTOR_SLUGS = ["recepcao", "auditoria", "sucesso"];
const DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

const SP_TZ = "America/Sao_Paulo";
const spDatePartsFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP_TZ,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});
const spTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP_TZ,
  hour: "2-digit",
  minute: "2-digit",
});

// SP timezone: get current Monday 00:00 → Saturday 23:59 range
function getWeekRangeSP(): { monday: Date; saturday: Date } {
  const now = new Date();
  // Get short weekday in SP and map to 0..6 (Sun..Sat)
  const wdShort = new Intl.DateTimeFormat("en-US", { timeZone: SP_TZ, weekday: "short" })
    .format(now)
    .toLowerCase();
  const wdMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const weekday = wdMap[wdShort] ?? 1;
  // Days to subtract to reach Monday: Sun(0)→-6, Mon(1)→0, Tue(2)→-1, ...
  const diffToMon = weekday === 0 ? -6 : 1 - weekday;
  const spToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const monday = new Date(`${spToday}T00:00:00-03:00`);
  monday.setUTCDate(monday.getUTCDate() + diffToMon);
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  saturday.setUTCHours(23, 59, 59, 999);
  return { monday, saturday };
}

function spDateParts(iso: string): { dow: number; label: string; ddmm: string } {
  const parts = spDatePartsFormatter.formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const dd = parts.find((p) => p.type === "day")?.value ?? "";
  const mm = parts.find((p) => p.type === "month")?.value ?? "";
  const dowMap: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    "segunda-feira": 1,
    terça: 2,
    "terça-feira": 2,
    terca: 2,
    "terca-feira": 2,
    quarta: 3,
    "quarta-feira": 3,
    quinta: 4,
    "quinta-feira": 4,
    sexta: 5,
    "sexta-feira": 5,
    sábado: 6,
    sabado: 6,
  };
  const normalizedWeekday = weekday.toLowerCase();
  const dow = dowMap[normalizedWeekday] ?? 0;
  return { dow, label: DAY_LABELS[dow], ddmm: `${dd}/${mm}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  const isCron = cronSecret && providedSecret && providedSecret === cronSecret;
  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (error || !data?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { monday, saturday } = getWeekRangeSP();
    const weekStartLabel = `${String(monday.getUTCDate()).padStart(2, "0")}/${String(monday.getUTCMonth() + 1).padStart(2, "0")}`;

    // 1) Load target sectors
    const { data: sectors, error: secErr } = await supabase
      .from("sectors")
      .select("id, slug, name")
      .in("slug", TARGET_SECTOR_SLUGS);
    if (secErr) throw secErr;
    if (!sectors || sectors.length === 0) {
      throw new Error("Nenhum setor alvo encontrado");
    }

    // 2) Ensure 6 daily stages per sector (Seg..Sáb)
    type StageInfo = { sector_id: string; dow: number; stage_id: string };
    const stageMap = new Map<string, string>(); // key `${sector_id}:${dow}` → stage_id

    for (const sector of sectors) {
      // Existing stages with our slug pattern
      const { data: existing } = await supabase
        .from("kanban_stages")
        .select("id, slug, sort_order")
        .eq("sector_id", sector.id);

      for (let i = 0; i < 6; i++) {
        const dow = i + 1; // 1=Mon..6=Sat
        const slug = `agenda-${DAY_SHORT[dow]}`;
        const found = existing?.find((s) => s.slug === slug);
        if (found) {
          stageMap.set(`${sector.id}:${dow}`, found.id);
          continue;
        }
        const { data: created, error: csErr } = await supabase
          .from("kanban_stages")
          .insert({
            sector_id: sector.id,
            name: `${DAY_LABELS[dow]} (Agenda)`,
            slug,
            sort_order: 1000 + dow, // push to the end
            color: "#3b82f6",
            active: true,
            is_won: false,
            is_lost: false,
          })
          .select("id")
          .single();
        if (csErr) {
          console.error(`stage create err ${sector.slug}/${slug}:`, csErr.message);
          continue;
        }
        stageMap.set(`${sector.id}:${dow}`, created!.id);
      }
    }

    // 3) Load this week's appointments
    const { data: appts, error: apErr } = await supabase
      .from("clinic_appointments")
      .select("id, patient_name, patient_phone, doctor_name, appointment_at, contact_id")
      .gte("appointment_at", monday.toISOString())
      .lte("appointment_at", saturday.toISOString())
      .order("appointment_at", { ascending: true });
    if (apErr) throw apErr;

    console.log(`[week-to-clients] ${appts?.length ?? 0} appts in week ${weekStartLabel}`);

    // 4) For each appointment × each sector → insert client card
    let created = 0;
    let skipped = 0;
    const rows: Array<Record<string, unknown>> = [];

    for (const a of appts ?? []) {
      const parts = spDateParts(a.appointment_at as string);
      if (parts.dow < 1 || parts.dow > 6) {
        skipped++;
        continue; // skip Sundays
      }
      const time = spTimeFormatter.format(new Date(a.appointment_at as string));
      const noteLines = [
        `📅 ${parts.label} ${parts.ddmm} • ${time}`,
        a.doctor_name ? `👨‍⚕️ Dr(a). ${a.doctor_name}` : null,
        a.patient_phone ? `📱 ${a.patient_phone}` : null,
        `[agenda-semana]`,
      ].filter(Boolean).join("\n");

      for (const sector of sectors) {
        const stageId = stageMap.get(`${sector.id}:${parts.dow}`);
        if (!stageId) { skipped++; continue; }
        rows.push({
          name: a.patient_name,
          phone: a.patient_phone,
          notes: noteLines,
          sector_id: sector.id,
          stage_id: stageId,
          board_position: 0,
        });
      }
    }

    // 5) Bulk insert in batches
    const batchSize = 200;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const { error: insErr } = await supabase.from("clients").insert(slice);
      if (insErr) {
        console.error("insert batch err:", insErr.message);
        skipped += slice.length;
      } else {
        created += slice.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        week_start: monday.toISOString().slice(0, 10),
        appointments: appts?.length ?? 0,
        sectors: sectors.length,
        cards_created: created,
        skipped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("clinic-week-to-clients error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
