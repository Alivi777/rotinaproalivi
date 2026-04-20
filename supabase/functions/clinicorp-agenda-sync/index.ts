import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CLINICORP_BASE = "https://api.clinicorp.com/rest/v1";

type Appointment = {
  id?: string | number;
  appointment_id?: string | number;
  patient_id?: string | number;
  patient_name?: string;
  patient?: { id?: string | number; name?: string; full_name?: string; phone?: string; cell_phone?: string };
  patient_phone?: string;
  professional_id?: string | number;
  professional_name?: string;
  professional?: { id?: string | number; name?: string };
  doctor_id?: string | number;
  doctor_name?: string;
  start_date?: string;
  start_time?: string;
  date?: string;
  time?: string;
  appointment_at?: string;
  status?: string;
  duration?: number;
  [k: string]: unknown;
};

function authHeaders() {
  const token = Deno.env.get("CLINICORP_API_TOKEN");
  const user = Deno.env.get("CLINICORP_API_USER");
  if (!token || !user) {
    throw new Error("CLINICORP credentials missing");
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
    // Clinicorp aceita nomes diferentes; mandamos todas as variantes para garantir
    if (!params.subscriber) params.subscriber = subscriber;
    if (!params.subscriber_id) params.subscriber_id = subscriber;
    if (!params.id_subscriber) params.id_subscriber = subscriber;
    if (!params.assinante) params.assinante = subscriber;
    if (!params.id_assinante) params.id_assinante = subscriber;
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  console.log(`[clinicorp] GET ${url.toString().replace(subscriber ?? "____", "***")}`);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[clinicorp] ${path} ${res.status}: ${text.slice(0, 500)}`);
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
  const obj = res as Record<string, unknown>;
  for (const key of ["data", "result", "appointments", "items"]) {
    const v = obj?.[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

function toIsoDate(a: Appointment): string | null {
  if (a.appointment_at) return new Date(a.appointment_at as string).toISOString();
  const date = (a.start_date || a.date) as string | undefined;
  const time = (a.start_time || a.time) as string | undefined;
  if (!date) return null;
  const dt = time ? `${date}T${time}` : `${date}T00:00:00`;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function pickPatientName(a: Appointment): string {
  return (
    a.patient?.full_name ||
    a.patient?.name ||
    (a.patient_name as string) ||
    "Paciente"
  );
}

function pickPatientPhone(a: Appointment): string | null {
  return (
    a.patient?.cell_phone ||
    a.patient?.phone ||
    (a.patient_phone as string) ||
    null
  );
}

function pickPatientExtId(a: Appointment): string | null {
  const v = a.patient?.id ?? a.patient_id;
  return v != null ? String(v) : null;
}

function pickDoctor(a: Appointment): { extId: string | null; name: string | null } {
  const id = a.professional?.id ?? a.professional_id ?? a.doctor_id;
  const name =
    a.professional?.name ||
    (a.professional_name as string) ||
    (a.doctor_name as string) ||
    null;
  return { extId: id != null ? String(id) : null, name };
}

// Rule of tasks: D-7, D-6, D-5, D-4, D-3, D-2, D-1
const TASK_RULE: { offset: number; type: string }[] = [
  { offset: 7, type: "confirm_d7" },
  { offset: 6, type: "confirm_d6" },
  { offset: 5, type: "confirm_d5" },
  { offset: 4, type: "confirm_d4" },
  { offset: 3, type: "protocol_d3" },
  { offset: 2, type: "urgency_d2" },
  { offset: 1, type: "unbook_confirm_d1" },
];

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
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
    const daysAhead: number = Number(body.days_ahead ?? 30);

    // 1) Fetch appointments next N days
    const today = new Date();
    const end = new Date();
    end.setDate(today.getDate() + daysAhead);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const res = await clinicorpGet("/appointment/list", {
      start_date: fmt(today),
      end_date: fmt(end),
    });
    const list = extractList(res) as Appointment[];

    // 2) Load doctors map (and auto-create new ones)
    const { data: existingDoctors } = await supabase
      .from("clinic_doctors")
      .select("id, external_id, name, assigned_user_id");

    const doctorMap = new Map<string, { id: string; assigned_user_id: string | null }>();
    const doctorByName = new Map<string, { id: string; assigned_user_id: string | null }>();
    for (const d of existingDoctors || []) {
      if (d.external_id) doctorMap.set(d.external_id, { id: d.id, assigned_user_id: d.assigned_user_id });
      doctorByName.set((d.name || "").toLowerCase().trim(), { id: d.id, assigned_user_id: d.assigned_user_id });
    }

    // Ensure each doctor seen exists
    const newDoctors: { external_id: string; name: string }[] = [];
    for (const a of list) {
      const dr = pickDoctor(a);
      if (dr.extId && !doctorMap.has(dr.extId)) {
        // Try to match by name to existing seeded doctor
        const byName = dr.name ? doctorByName.get(dr.name.toLowerCase().trim()) : undefined;
        if (byName) {
          // Update external_id on the matched seed doctor
          await supabase.from("clinic_doctors").update({ external_id: dr.extId }).eq("id", byName.id);
          doctorMap.set(dr.extId, byName);
        } else if (dr.name) {
          newDoctors.push({ external_id: dr.extId, name: dr.name });
        }
      }
    }
    if (newDoctors.length) {
      const { data: inserted } = await supabase
        .from("clinic_doctors")
        .upsert(newDoctors, { onConflict: "external_id" })
        .select("id, external_id, assigned_user_id");
      for (const d of inserted || []) {
        if (d.external_id) doctorMap.set(d.external_id, { id: d.id, assigned_user_id: d.assigned_user_id });
      }
    }

    // 3) Upsert appointments
    let appointmentsCount = 0;
    const appointmentRows: Record<string, unknown>[] = [];
    for (const a of list) {
      const at = toIsoDate(a);
      if (!at) continue;
      const dr = pickDoctor(a);
      const doctor = dr.extId ? doctorMap.get(dr.extId) : undefined;
      const extId = String(a.id ?? a.appointment_id ?? `${pickPatientExtId(a)}_${at}`);
      appointmentRows.push({
        external_id: extId,
        patient_external_id: pickPatientExtId(a),
        patient_name: pickPatientName(a),
        patient_phone: pickPatientPhone(a),
        doctor_id: doctor?.id ?? null,
        doctor_external_id: dr.extId,
        doctor_name: dr.name,
        appointment_at: at,
        duration_min: typeof a.duration === "number" ? a.duration : null,
        status: (a.status as string) || "scheduled",
        synced_at: new Date().toISOString(),
      });
    }
    if (appointmentRows.length) {
      const { error: apptErr } = await supabase
        .from("clinic_appointments")
        .upsert(appointmentRows, { onConflict: "external_id" });
      if (apptErr) throw new Error(`appointments upsert: ${apptErr.message}`);
      appointmentsCount = appointmentRows.length;
    }

    // 4) Reload appointments to get IDs and link contacts
    const { data: storedAppts } = await supabase
      .from("clinic_appointments")
      .select("id, external_id, patient_external_id, patient_name, patient_phone, doctor_id, doctor_name, appointment_at, contact_id")
      .gte("appointment_at", today.toISOString())
      .lte("appointment_at", end.toISOString());

    // Best-effort: link contact_id via external_id or phone
    const phonesToFind = new Set<string>();
    const extIdsToFind = new Set<string>();
    for (const a of storedAppts || []) {
      if (!a.contact_id) {
        if (a.patient_external_id) extIdsToFind.add(a.patient_external_id);
        if (a.patient_phone) phonesToFind.add(a.patient_phone.replace(/\D/g, ""));
      }
    }
    const contactByExt = new Map<string, string>();
    const contactByPhone = new Map<string, string>();
    if (extIdsToFind.size) {
      const { data } = await supabase
        .from("contacts")
        .select("id, external_id")
        .in("external_id", [...extIdsToFind]);
      for (const c of data || []) if (c.external_id) contactByExt.set(c.external_id, c.id);
    }
    if (phonesToFind.size) {
      const { data } = await supabase
        .from("contacts")
        .select("id, phone_normalized")
        .in("phone_normalized", [...phonesToFind]);
      for (const c of data || []) if (c.phone_normalized) contactByPhone.set(c.phone_normalized, c.id);
    }

    // 5) Generate daily tasks from rule
    const taskRows: Record<string, unknown>[] = [];
    const todayDateOnly = dateOnly(today);

    for (const a of storedAppts || []) {
      const apptDate = new Date(a.appointment_at as string);
      const doctor = (a.doctor_id ? [...doctorMap.values()].find((d) => d.id === a.doctor_id) : null);
      const assignedTo = doctor?.assigned_user_id ?? null;

      const contactId =
        a.contact_id ||
        (a.patient_external_id ? contactByExt.get(a.patient_external_id) : null) ||
        (a.patient_phone ? contactByPhone.get(a.patient_phone.replace(/\D/g, "")) : null) ||
        null;

      for (const rule of TASK_RULE) {
        const taskDate = new Date(apptDate);
        taskDate.setDate(apptDate.getDate() - rule.offset);
        const taskDateStr = dateOnly(taskDate);
        // Only generate tasks today or in the future
        if (taskDateStr < todayDateOnly) continue;
        taskRows.push({
          appointment_id: a.id,
          contact_id: contactId,
          patient_name: a.patient_name,
          patient_phone: a.patient_phone,
          doctor_id: a.doctor_id,
          doctor_name: a.doctor_name,
          appointment_at: a.appointment_at,
          task_type: rule.type,
          task_date: taskDateStr,
          assigned_to: assignedTo,
          status: "pending",
        });
      }
    }

    // 6) Birthday tasks: ALL contacts whose birth_date matches any day in window
    // Assigned to "Rafaely" — find first user whose display_name ILIKE 'rafaely'
    const { data: rafaely } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("display_name", "%rafael%")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const birthdayAssignee = rafaely?.user_id ?? null;

    const { data: contactsBday } = await supabase
      .from("contacts")
      .select("id, name, phone, birth_date")
      .not("birth_date", "is", null);

    for (const c of contactsBday || []) {
      if (!c.birth_date) continue;
      const [_, m, d] = (c.birth_date as string).split("-");
      // Check if mm-dd falls within window
      for (let i = 0; i <= daysAhead; i++) {
        const candidate = new Date(today);
        candidate.setDate(today.getDate() + i);
        const cm = String(candidate.getMonth() + 1).padStart(2, "0");
        const cd = String(candidate.getDate()).padStart(2, "0");
        if (cm === m && cd === d) {
          taskRows.push({
            appointment_id: null,
            contact_id: c.id,
            patient_name: c.name,
            patient_phone: c.phone,
            doctor_id: null,
            doctor_name: null,
            appointment_at: null,
            task_type: "birthday",
            task_date: dateOnly(candidate),
            assigned_to: birthdayAssignee,
            status: "pending",
          });
        }
      }
    }

    // 7) Upsert tasks in batches
    let tasksCount = 0;
    const batchSize = 200;
    for (let i = 0; i < taskRows.length; i += batchSize) {
      const slice = taskRows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("clinic_daily_tasks")
        .upsert(slice, { onConflict: "appointment_id,task_type,contact_id", ignoreDuplicates: false });
      if (error) {
        console.error("tasks upsert error:", error.message);
      } else {
        tasksCount += slice.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        appointments: appointmentsCount,
        tasks_generated: tasksCount,
        days_ahead: daysAhead,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("clinicorp-agenda-sync error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
