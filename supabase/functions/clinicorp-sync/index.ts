import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CLINICORP_BASE = "https://api.clinicorp.com/rest/v1";

type SyncMode = "full" | "recent" | "birthdays_month";

type Patient = {
  id?: string | number;
  code?: string;
  name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  cell_phone?: string;
  mobile_phone?: string;
  birth_date?: string;
  birthday?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  zip?: string;
  tags?: string[] | string;
  // Loose typing — Clinicorp returns variable shapes
  [key: string]: unknown;
};

function authHeaders() {
  const token = Deno.env.get("CLINICORP_API_TOKEN");
  const user = Deno.env.get("CLINICORP_API_USER");
  if (!token || !user) {
    throw new Error("CLINICORP_API_TOKEN / CLINICORP_API_USER not configured");
  }
  // Clinicorp uses Basic Auth with user:token (most common pattern for their REST API)
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
  if (subscriber && !params.subscriber) params.subscriber = subscriber;
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Clinicorp ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function pickPhone(p: Patient): string | null {
  return (
    (p.cell_phone as string) ||
    (p.mobile_phone as string) ||
    (p.phone as string) ||
    null
  );
}

function pickName(p: Patient): string {
  return (
    (p.full_name as string) ||
    (p.name as string) ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    "Sem nome"
  );
}

function normalizeContact(p: Patient, sectorId: string | null) {
  const tagsRaw = p.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw
    : typeof tagsRaw === "string" && tagsRaw
      ? tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
      : [];

  const cpfDigits = (p.cpf || "").replace(/\D/g, "") || null;

  return {
    external_id: p.id != null ? String(p.id) : (p.code as string) || null,
    name: pickName(p),
    phone: pickPhone(p),
    email: (p.email as string) || null,
    cpf: cpfDigits,
    birth_date: ((p.birth_date as string) || (p.birthday as string)) ?? null,
    address:
      ((p.address as string) || (p.street as string)) ?? null,
    city: (p.city as string) || null,
    state: (p.state as string) || null,
    zip_code: ((p.zip_code as string) || (p.zip as string)) ?? null,
    tags,
    sector_id: sectorId,
    source: "clinicorp",
    imported_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
  };
}

async function fetchPatientsByBirthdays(month: number) {
  // Clinicorp birthdays endpoint typically accepts a month
  const res = await clinicorpGet("/patient/birthdays", { month: String(month) });
  // Try to extract array from common response shapes
  if (Array.isArray(res)) return res as Patient[];
  if (Array.isArray((res as { data?: Patient[] }).data))
    return (res as { data: Patient[] }).data;
  if (Array.isArray((res as { result?: Patient[] }).result))
    return (res as { result: Patient[] }).result;
  if (Array.isArray((res as { patients?: Patient[] }).patients))
    return (res as { patients: Patient[] }).patients;
  return [];
}

async function fetchPatientsByRecentAppointments(daysBack: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - daysBack);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const res = await clinicorpGet("/appointment/list", {
    start_date: fmt(start),
    end_date: fmt(end),
  });
  const list: Array<Record<string, unknown>> = Array.isArray(res)
    ? (res as Array<Record<string, unknown>>)
    : Array.isArray((res as { data?: unknown[] }).data)
      ? ((res as { data: Array<Record<string, unknown>> }).data)
      : Array.isArray((res as { result?: unknown[] }).result)
        ? ((res as { result: Array<Record<string, unknown>> }).result)
        : [];
  // Each appointment usually carries patient info — extract & dedupe
  const map = new Map<string, Patient>();
  for (const a of list) {
    const patient = (a.patient as Patient) ||
      (a.patient_data as Patient) || {
        id: a.patient_id,
        name: a.patient_name as string,
        phone: a.patient_phone as string,
      };
    const key = String(patient.id ?? patient.cpf ?? patient.name ?? "");
    if (key && !map.has(key)) map.set(key, patient);
  }
  return [...map.values()];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode: SyncMode = (body.mode as SyncMode) || "recent";
    const sectorId: string | null = body.sector_id ?? null;
    const daysBack: number = Number(body.days_back ?? 90);

    // Create import record
    const { data: imp, error: impErr } = await supabase
      .from("contact_imports")
      .insert({
        imported_by:
          body.user_id ??
          "00000000-0000-0000-0000-000000000000",
        file_name: `clinicorp:${mode}`,
        status: "running",
        default_sector_id: sectorId,
      })
      .select()
      .single();

    if (impErr) throw new Error(`import insert: ${impErr.message}`);

    let patients: Patient[] = [];

    if (mode === "full") {
      // Birthdays for all 12 months + recent appointments
      for (let m = 1; m <= 12; m++) {
        const batch = await fetchPatientsByBirthdays(m);
        patients.push(...batch);
      }
      const recent = await fetchPatientsByRecentAppointments(365);
      patients.push(...recent);
    } else if (mode === "birthdays_month") {
      const month = Number(body.month ?? new Date().getMonth() + 1);
      patients = await fetchPatientsByBirthdays(month);
    } else {
      // recent (default for daily cron)
      patients = await fetchPatientsByRecentAppointments(daysBack);
      // Also get this month's birthdays so birthday list stays fresh
      const month = new Date().getMonth() + 1;
      const bdays = await fetchPatientsByBirthdays(month);
      patients.push(...bdays);
    }

    // Dedupe
    const seen = new Set<string>();
    const dedup: Patient[] = [];
    for (const p of patients) {
      const key = String(p.id ?? p.cpf ?? `${pickName(p)}|${pickPhone(p)}`);
      if (key && !seen.has(key)) {
        seen.add(key);
        dedup.push(p);
      }
    }

    // Upsert in batches
    let created = 0;
    let updated = 0;
    let errors = 0;
    const batchSize = 200;
    for (let i = 0; i < dedup.length; i += batchSize) {
      const slice = dedup
        .slice(i, i + batchSize)
        .map((p) => ({ ...normalizeContact(p, sectorId), import_id: imp.id }));

      const withExt = slice.filter((x) => x.external_id);
      const noExt = slice.filter((x) => !x.external_id);

      if (withExt.length) {
        const { error, count } = await supabase
          .from("contacts")
          .upsert(withExt, { onConflict: "external_id", count: "exact" });
        if (error) errors += withExt.length;
        else created += count ?? withExt.length;
      }
      if (noExt.length) {
        const withCpf = noExt.filter((x) => x.cpf);
        const noKey = noExt.filter((x) => !x.cpf);
        if (withCpf.length) {
          const { error, count } = await supabase
            .from("contacts")
            .upsert(withCpf, { onConflict: "cpf", count: "exact" });
          if (error) errors += withCpf.length;
          else updated += count ?? withCpf.length;
        }
        if (noKey.length) {
          const { error, count } = await supabase
            .from("contacts")
            .insert(noKey, { count: "exact" });
          if (error) errors += noKey.length;
          else created += count ?? noKey.length;
        }
      }
    }

    await supabase
      .from("contact_imports")
      .update({
        status: "done",
        total_rows: dedup.length,
        created_count: created,
        updated_count: updated,
        error_count: errors,
      })
      .eq("id", imp.id);

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        total: dedup.length,
        created,
        updated,
        errors,
        import_id: imp.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("clinicorp-sync error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
