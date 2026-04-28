import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CLINICORP_BASE = "https://api.clinicorp.com/rest/v1";

type SyncMode = "full" | "recent" | "birthdays_month";

type Appointment = {
  id?: string | number;
  appointment_id?: string | number;
  patient_id?: string | number;
  patient_name?: string;
  patient?: { id?: string | number; name?: string; full_name?: string; phone?: string; cell_phone?: string; email?: string; cpf?: string; birth_date?: string };
  patient_phone?: string;
  Patient_PersonId?: string | number;
  PatientName?: string;
  MobilePhone?: string;
  HomePhone?: string;
  Email?: string;
  CPF?: string;
  BirthDate?: string;
  date?: string;
  start_date?: string;
  appointment_at?: string;
  fromTime?: string;
  start_time?: string;
  [k: string]: unknown;
};

function authHeaders() {
  const token = Deno.env.get("CLINICORP_API_TOKEN");
  const user = Deno.env.get("CLINICORP_API_USER");
  if (!token || !user) {
    throw new Error("CLINICORP_API_TOKEN / CLINICORP_API_USER not configured");
  }
  const basic = btoa(`${user}:${token}`);
  return {
    Authorization: `Basic ${basic}`,
    "x-api-user": user,
    "x-api-token": token,
    Accept: "application/json",
  };
}

async function clinicorpGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${CLINICORP_BASE}${path}`);
  const subscriber = Deno.env.get("CLINICORP_SUBSCRIBER");
  if (subscriber) {
    if (!params.subscriber) params.subscriber = subscriber;
    if (!params.subscriber_id) params.subscriber_id = subscriber;
    if (!params.id_subscriber) params.id_subscriber = subscriber;
    if (!params.assinante) params.assinante = subscriber;
    if (!params.id_assinante) params.id_assinante = subscriber;
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  console.log(`[clinicorp-sync] GET ${url.pathname}?${url.searchParams.toString().slice(0, 200)}`);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[clinicorp-sync] ${path} ${res.status}: ${text.slice(0, 400)}`);
    throw new Error(`Clinicorp ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractList(res: unknown): Record<string, unknown>[] {
  if (Array.isArray(res)) return res as Record<string, unknown>[];
  if (!res || typeof res !== "object") return [];
  const tryKeys = ["data", "result", "appointments", "items", "list", "rows", "agendamentos", "agenda", "schedules", "patients", "pacientes"];
  const queue: unknown[] = [res];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      if (current.length > 0 && typeof current[0] === "object") return current as Record<string, unknown>[];
      continue;
    }
    const obj = current as Record<string, unknown>;
    for (const key of tryKeys) {
      const value = obj[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
      if (value && typeof value === "object") queue.push(value);
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return [];
}

function pickPhone(a: Appointment): string | null {
  return (a.MobilePhone as string) || (a.HomePhone as string) || (a.patient?.cell_phone as string) || (a.patient?.phone as string) || (a.patient_phone as string) || null;
}
function pickName(a: Appointment): string {
  return (a.PatientName as string) || (a.patient?.full_name as string) || (a.patient?.name as string) || (a.patient_name as string) || "Sem nome";
}
function pickExtId(a: Appointment): string | null {
  const v = a.Patient_PersonId ?? a.patient?.id ?? a.patient_id;
  return v != null ? String(v) : null;
}
function pickEmail(a: Appointment): string | null {
  return (a.Email as string) || (a.patient as { email?: string } | undefined)?.email || null;
}
function pickCpf(a: Appointment): string | null {
  const v = (a.CPF as string) || (a.patient as { cpf?: string } | undefined)?.cpf || null;
  return v ? v.replace(/\D/g, "") || null : null;
}
function pickBirth(a: Appointment): string | null {
  const v = (a.BirthDate as string) || (a.patient as { birth_date?: string } | undefined)?.birth_date || null;
  if (!v) return null;
  // Accept ISO or BR format
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
function pickApptDate(a: Appointment): string | null {
  const base = (a.date || a.start_date || a.appointment_at) as string | undefined;
  if (!base) return null;
  const d = new Date(base);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchAppointmentsRange(startISO: string, endISO: string): Promise<Appointment[]> {
  const res = await clinicorpGet("/appointment/list", {
    start_date: startISO, end_date: endISO,
    start_date_json: startISO, end_date_json: endISO,
    data_inicial: startISO, data_final: endISO,
    data_inicio: startISO, data_fim: endISO,
    from: startISO, to: endISO,
  });
  return extractList(res) as Appointment[];
}

function fmt(d: Date) { return d.toISOString().slice(0, 10); }

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
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode: SyncMode = (body.mode as SyncMode) || "recent";
    // Accept either single sector_id or multiple sector_ids (round-robin distribution)
    const sectorIds: string[] = Array.isArray(body.sector_ids) && body.sector_ids.length
      ? body.sector_ids.map((s: unknown) => String(s))
      : body.sector_id ? [String(body.sector_id)] : [];
    const daysBack: number = Number(body.days_back ?? 90);

    const { data: imp, error: impErr } = await supabase
      .from("contact_imports")
      .insert({
        imported_by: body.user_id ?? "00000000-0000-0000-0000-000000000000",
        file_name: `clinicorp:${mode}`,
        status: "running",
        default_sector_id: sectorIds[0] ?? null,
      })
      .select()
      .single();
    if (impErr) throw new Error(`import insert: ${impErr.message}`);

    // Strategy: pull appointments over a wide window (past + future) to derive ALL active patients
    // This is far more reliable than birthday endpoints (which often don't exist in Clinicorp).
    const today = new Date();
    let startDate: Date, endDate: Date;
    if (mode === "full") {
      startDate = new Date(today); startDate.setDate(today.getDate() - 365);
      endDate = new Date(today); endDate.setDate(today.getDate() + 180);
    } else if (mode === "birthdays_month") {
      // Pull a 60-day window — birthdays will surface via appointment data + fallback to existing contacts
      startDate = new Date(today); startDate.setDate(today.getDate() - 30);
      endDate = new Date(today); endDate.setDate(today.getDate() + 30);
    } else {
      startDate = new Date(today); startDate.setDate(today.getDate() - daysBack);
      endDate = new Date(today); endDate.setDate(today.getDate() + 60);
    }

    // Chunk into 60-day windows to avoid huge payloads
    const allAppts: Appointment[] = [];
    const chunkDays = 60;
    let cursor = new Date(startDate);
    while (cursor < endDate) {
      const chunkEnd = new Date(cursor);
      chunkEnd.setDate(cursor.getDate() + chunkDays);
      const realEnd = chunkEnd > endDate ? endDate : chunkEnd;
      try {
        const batch = await fetchAppointmentsRange(fmt(cursor), fmt(realEnd));
        console.log(`[clinicorp-sync] ${fmt(cursor)} → ${fmt(realEnd)}: ${batch.length} appts`);
        allAppts.push(...batch);
      } catch (e) {
        console.error(`[clinicorp-sync] chunk failed ${fmt(cursor)}: ${(e as Error).message}`);
      }
      cursor = new Date(realEnd);
      cursor.setDate(cursor.getDate() + 1);
    }

    console.log(`[clinicorp-sync] total appointments fetched: ${allAppts.length}`);

    // Dedupe patients by external_id → cpf → name+phone
    const patientsMap = new Map<string, {
      external_id: string | null;
      name: string;
      phone: string | null;
      email: string | null;
      cpf: string | null;
      birth_date: string | null;
      last_appointment_at: string | null;
    }>();

    for (const a of allAppts) {
      const extId = pickExtId(a);
      const name = pickName(a);
      const phone = pickPhone(a);
      const cpf = pickCpf(a);
      const apptDate = pickApptDate(a);
      const key = extId || cpf || `${name}|${phone || ""}`.toLowerCase();
      if (!key || key === "|") continue;
      const existing = patientsMap.get(key);
      const last = existing?.last_appointment_at;
      const newLast = apptDate && (!last || apptDate > last) ? apptDate : (last ?? apptDate);
      patientsMap.set(key, {
        external_id: extId,
        name,
        phone,
        email: pickEmail(a) || existing?.email || null,
        cpf: cpf || existing?.cpf || null,
        birth_date: pickBirth(a) || existing?.birth_date || null,
        last_appointment_at: newLast ?? null,
      });
    }

    const patients = [...patientsMap.values()];
    console.log(`[clinicorp-sync] unique patients derived: ${patients.length}`);

    // Round-robin assign sector if multiple sectors selected
    function pickSector(idx: number): string | null {
      if (sectorIds.length === 0) return null;
      return sectorIds[idx % sectorIds.length];
    }

    let created = 0;
    let updated = 0;
    let errors = 0;
    const batchSize = 200;

    for (let i = 0; i < patients.length; i += batchSize) {
      const slice = patients.slice(i, i + batchSize).map((p, j) => ({
        external_id: p.external_id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        cpf: p.cpf,
        birth_date: p.birth_date,
        last_appointment_at: p.last_appointment_at,
        sector_id: pickSector(i + j),
        source: "clinicorp",
        is_active: true,
        imported_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        import_id: imp.id,
      }));

      // Split by available conflict key
      const withExt = slice.filter((x) => x.external_id);
      const withCpfOnly = slice.filter((x) => !x.external_id && x.cpf);
      const noKey = slice.filter((x) => !x.external_id && !x.cpf);

      if (withExt.length) {
        const { error, data } = await supabase
          .from("contacts")
          .upsert(withExt, { onConflict: "external_id" })
          .select("id");
        if (error) {
          console.error("[clinicorp-sync] upsert ext err:", error.message);
          errors += withExt.length;
        } else {
          updated += data?.length ?? withExt.length;
        }
      }
      if (withCpfOnly.length) {
        const { error, data } = await supabase
          .from("contacts")
          .upsert(withCpfOnly, { onConflict: "cpf" })
          .select("id");
        if (error) {
          console.error("[clinicorp-sync] upsert cpf err:", error.message);
          errors += withCpfOnly.length;
        } else {
          updated += data?.length ?? withCpfOnly.length;
        }
      }
      if (noKey.length) {
        const { error, data } = await supabase
          .from("contacts")
          .insert(noKey)
          .select("id");
        if (error) {
          console.error("[clinicorp-sync] insert nokey err:", error.message);
          errors += noKey.length;
        } else {
          created += data?.length ?? noKey.length;
        }
      }
    }

    await supabase
      .from("contact_imports")
      .update({
        status: "done",
        total_rows: patients.length,
        created_count: created,
        updated_count: updated,
        error_count: errors,
      })
      .eq("id", imp.id);

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        sectors_used: sectorIds.length,
        appointments_scanned: allAppts.length,
        total: patients.length,
        created,
        updated,
        errors,
        import_id: imp.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("clinicorp-sync error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
