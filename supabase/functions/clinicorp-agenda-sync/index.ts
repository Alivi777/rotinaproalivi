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
  Patient_PersonId?: string | number;
  PatientName?: string;
  MobilePhone?: string;
  Dentist_PersonId?: string | number;
  DentistName?: string;
  fromTime?: string;
  toTime?: string;
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
  if (!res || typeof res !== "object") return [];

  const tryKeys = ["data", "result", "appointments", "items", "list", "rows", "agendamentos", "agenda", "schedules"];
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

function toIsoDate(a: Appointment): string | null {
  const baseDate = (a.date || a.start_date || a.appointment_at || a.appointment_date || a.schedule_date || a.data || a.data_agendamento) as string | undefined;
  const time = (a.fromTime || a.start_time || a.time || a.appointment_time || a.schedule_time || a.hour || a.hora) as string | undefined;

  if (!baseDate) return null;

  const parsedBase = new Date(baseDate);
  if (isNaN(parsedBase.getTime())) return null;

  if (!time) {
    return parsedBase.toISOString();
  }

  const [hours, minutes] = time.split(":").map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return parsedBase.toISOString();

  parsedBase.setUTCHours(hours, minutes, 0, 0);
  return parsedBase.toISOString();
}

function pickPatientName(a: Appointment): string {
  return a.PatientName || a.patient?.full_name || a.patient?.name || (a.patient_name as string) || "Paciente";
}

function pickPatientPhone(a: Appointment): string | null {
  return a.MobilePhone || a.patient?.cell_phone || a.patient?.phone || (a.patient_phone as string) || null;
}

function pickPatientExtId(a: Appointment): string | null {
  const v = a.Patient_PersonId ?? a.patient?.id ?? a.patient_id;
  return v != null ? String(v) : null;
}

function pickDoctor(a: Appointment): { extId: string | null; name: string | null } {
  const id = a.Dentist_PersonId ?? a.professional?.id ?? a.professional_id ?? a.doctor_id;
  const name = a.DentistName || a.professional?.name || (a.professional_name as string) || (a.doctor_name as string) || null;
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
      start_date_json: fmt(today),
      end_date_json: fmt(end),
      data_inicial: fmt(today),
      data_final: fmt(end),
      data_inicio: fmt(today),
      data_fim: fmt(end),
      from: fmt(today),
      to: fmt(end),
    });
    const list = extractList(res) as Appointment[];
    if (list.length === 0) {
      const topLevelKeys = res && typeof res === "object" ? Object.keys(res as Record<string, unknown>).slice(0, 20) : [];
      console.warn("[clinicorp] appointment/list returned no extracted items", {
        responseType: Array.isArray(res) ? "array" : typeof res,
        topLevelKeys,
        sample: JSON.stringify(res).slice(0, 1200),
      });
    }

    // 2a) Tentar buscar nomes reais de profissionais via endpoint do Clinicorp
    const dentistNames = new Map<string, string>();
    const dentistEndpoints = [
      "/professional/list",
      "/dentist/list",
      "/person/list",
      "/user/list",
    ];
    for (const ep of dentistEndpoints) {
      try {
        const r = await clinicorpGet(ep, {});
        const items = extractList(r);
        for (const it of items) {
          const o = it as Record<string, unknown>;
          const id = String(o.PersonId ?? o.Person_Id ?? o.id ?? o.Id ?? "");
          const name = String(o.Name ?? o.name ?? o.FullName ?? o.full_name ?? o.DentistName ?? "").trim();
          if (id && name) dentistNames.set(id, name);
        }
        if (dentistNames.size > 0) {
          console.log(`[clinicorp] resolved ${dentistNames.size} doctor names via ${ep}`);
          break;
        }
      } catch (err) {
        console.log(`[clinicorp] ${ep} failed: ${(err as Error).message.slice(0, 120)}`);
      }
    }

    // 2b) Coletar TODOS os IDs de doutor que aparecem na agenda
    const seenDoctorIds = new Set<string>();
    for (const a of list) {
      const dr = pickDoctor(a);
      if (dr.extId) seenDoctorIds.add(dr.extId);
    }

    // 2c) Recarregar doutores atuais para respeitar nomes travados manualmente
    const { data: doctorsBeforeUpsert } = await supabase
      .from("clinic_doctors")
      .select("id, external_id, name, assigned_user_id, active, name_locked");

    const existingDoctorMap = new Map<string, {
      id: string;
      assigned_user_id: string | null;
      name: string;
      name_locked?: boolean | null;
    }>();
    for (const d of doctorsBeforeUpsert || []) {
      if (d.external_id) {
        existingDoctorMap.set(d.external_id, {
          id: d.id,
          assigned_user_id: d.assigned_user_id,
          name: d.name || "",
          name_locked: (d as { name_locked?: boolean | null }).name_locked,
        });
      }
    }

    // 2d) Auto-cadastrar/atualizar TODOS os doutores que apareceram (ativos por padrão)
    if (seenDoctorIds.size) {
      const upsertDoctors = [...seenDoctorIds].map((extId) => {
        const existing = existingDoctorMap.get(extId);
        const syncedName = dentistNames.get(extId) || `Profissional #${extId}`;
        return {
          external_id: extId,
          name: existing?.name_locked ? existing.name : syncedName,
          active: true,
        };
      });
      const { error: drErr } = await supabase
        .from("clinic_doctors")
        .upsert(upsertDoctors, { onConflict: "external_id", ignoreDuplicates: false });
      if (drErr) console.error("[clinicorp] doctor upsert err:", drErr.message);

      // Atualizar nomes só de agendas não travadas e ainda placeholders
      for (const [extId, realName] of dentistNames) {
        await supabase
          .from("clinic_doctors")
          .update({ name: realName })
          .eq("external_id", extId)
          .eq("name_locked", false)
          .like("name", "Profissional #%");
      }
    }

    // 2e) Recarregar mapa completo de doutores
    const { data: existingDoctors } = await supabase
      .from("clinic_doctors")
      .select("id, external_id, name, assigned_user_id, active");

    const doctorMap = new Map<string, { id: string; assigned_user_id: string | null; name: string }>();
    for (const d of existingDoctors || []) {
      if (d.external_id) {
        doctorMap.set(d.external_id, {
          id: d.id,
          assigned_user_id: d.assigned_user_id,
          name: d.name || "",
        });
      }
    }
    console.log("[clinicorp] doctors loaded", { count: doctorMap.size });

    // 3) Upsert TODAS as agendas (sem filtrar por ativo)
    let appointmentsCount = 0;
    const appointmentRows: Record<string, unknown>[] = [];
    for (const a of list) {
      const at = toIsoDate(a);
      if (!at) continue;
      const dr = pickDoctor(a);
      const doctor = dr.extId ? doctorMap.get(dr.extId) : null;
      const extId = String(a.id ?? a.appointment_id ?? `${pickPatientExtId(a)}_${at}`);
      appointmentRows.push({
        external_id: extId,
        patient_external_id: pickPatientExtId(a),
        patient_name: pickPatientName(a),
        patient_phone: pickPatientPhone(a),
        doctor_id: doctor?.id ?? null,
        doctor_external_id: dr.extId,
        doctor_name: doctor?.name || dr.name || null,
        appointment_at: at,
        duration_min: typeof a.duration === "number" ? a.duration : null,
        status: (a.status as string) || "scheduled",
        synced_at: new Date().toISOString(),
      });
    }
    console.log("[clinicorp] appointments to upsert", { total: appointmentRows.length });

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
