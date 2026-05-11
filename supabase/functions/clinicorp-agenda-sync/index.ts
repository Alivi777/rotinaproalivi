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
  ScheduleToId?: string | number;
  ScheduleToName?: string;
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

const SP_TZ = "America/Sao_Paulo";
const spDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normalizeDateInput(value: string): string | null {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return spDateFormatter.format(parsed);
}

function normalizeTimeInput(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hh = match[1].padStart(2, "0");
  const mm = match[2];
  const ss = match[3] ?? "00";
  return `${hh}:${mm}:${ss}`;
}

function toIsoDate(a: Appointment): string | null {
  const rawDate = (a.date || a.start_date || a.appointment_at || a.appointment_date || a.schedule_date || a.data || a.data_agendamento) as string | undefined;
  const rawTime = (a.fromTime || a.start_time || a.time || a.appointment_time || a.schedule_time || a.hour || a.hora) as string | undefined;

  if (!rawDate) return null;

  const datePart = normalizeDateInput(rawDate);
  if (!datePart) return null;

  const timePart = normalizeTimeInput(rawTime);
  if (timePart) {
    return new Date(`${datePart}T${timePart}-03:00`).toISOString();
  }

  if (rawDate.includes("T")) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return new Date(`${datePart}T00:00:00-03:00`).toISOString();
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
  const id = a.ScheduleToId ?? a.Dentist_PersonId ?? a.professional?.id ?? a.professional_id ?? a.doctor_id;
  const name = a.ScheduleToName || a.DentistName || a.professional?.name || (a.professional_name as string) || (a.doctor_name as string) || null;
  return { extId: id != null ? String(id) : null, name };
}

function debugDoctorFields(rows: Appointment[]) {
  return rows.slice(0, 30).map((row) => {
    const picked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (/dent|doctor|prof|agenda|sched|chair|calendar|resource|column|user|book/i.test(key)) {
        picked[key] = value;
      }
    }
    picked.fromTime = row.fromTime;
    picked.toTime = row.toTime;
    picked.date = row.date || row.start_date || row.appointment_at;
    picked.patient = pickPatientName(row);
    return picked;
  });
}

// Agenda Clínica precisa espelhar exatamente o Clinicorp: apenas consultas do período.
const TASK_RULE: { offset: number; type: string; keep_past?: boolean }[] = [
  { offset: 0, type: "appointment", keep_past: true },
];

function dateOnly(d: Date): string {
  return spDateFormatter.format(d);
}

function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnly(d);
}

function mondayToSaturday(referenceKey: string): { startKey: string; endKey: string } {
  const ref = new Date(`${referenceKey}T00:00:00-03:00`);
  const dow = ref.getUTCDay() === 0 ? 7 : ref.getUTCDay();
  const monday = new Date(ref);
  monday.setUTCDate(ref.getUTCDate() - (dow - 1));
  return { startKey: dateOnly(monday), endKey: addDaysKey(dateOnly(monday), 5) };
}

function normalizeDoctorName(name: string | null | undefined): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
    const { data, error } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !data?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const today = new Date();
    const todayKey = dateOnly(today);
    const requestedStart = typeof body.start_date === "string" ? normalizeDateInput(body.start_date) : null;
    const requestedEnd = typeof body.end_date === "string" ? normalizeDateInput(body.end_date) : null;
    const daysAhead = typeof body.days_ahead === "number" ? body.days_ahead : null;
    const daysBack = typeof body.days_back === "number" ? body.days_back : null;
    const defaultWeek = mondayToSaturday(todayKey);
    const startKey = requestedStart
      || (daysBack != null ? addDaysKey(todayKey, -daysBack) : defaultWeek.startKey);
    const endKey = requestedEnd
      || (daysAhead != null ? addDaysKey(todayKey, daysAhead) : (requestedStart || defaultWeek.endKey));
    const start = new Date(`${startKey}T00:00:00-03:00`);
    const end = new Date(`${endKey}T23:59:59-03:00`);
    const totalDays = Math.max(0, Math.round((new Date(`${endKey}T00:00:00-03:00`).getTime() - new Date(`${startKey}T00:00:00-03:00`).getTime()) / 86400000));

    const fmt = (d: Date) => dateOnly(d);

    // Pagina dia-a-dia: a API do Clinicorp limita o total devolvido por chamada.
    const list: Appointment[] = [];
    const seenApptIds = new Set<string>();
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const ds = fmt(d);
      try {
        const dayRes = await clinicorpGet("/appointment/list", {
          start_date: ds,
          end_date: ds,
          start_date_json: ds,
          end_date_json: ds,
          data_inicial: ds,
          data_final: ds,
          data_inicio: ds,
          data_fim: ds,
          from: ds,
          to: ds,
        });
        const dayList = extractList(dayRes) as Appointment[];
        for (const a of dayList) {
          const id = String(a.id ?? a.appointment_id ?? `${a.Patient_PersonId ?? a.patient_id}_${a.date ?? a.start_date}_${a.fromTime ?? a.start_time ?? ""}`);
          if (seenApptIds.has(id)) continue;
          seenApptIds.add(id);
          list.push(a);
        }
        console.log(`[clinicorp] day ${ds}: +${dayList.length} (total ${list.length})`);
      } catch (err) {
        console.error(`[clinicorp] day ${ds} failed: ${(err as Error).message.slice(0, 200)}`);
      }
    }
    if (list.length === 0) {
      console.warn("[clinicorp] appointment/list returned no items across the window");
    }

    if (body.debug_doctor_fields === true) {
      return new Response(
        JSON.stringify({ success: true, start_date: startKey, end_date: endKey, total: list.length, sample: debugDoctorFields(list) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2a) Tentar buscar nomes reais de profissionais via endpoint do Clinicorp
    const dentistNames = new Map<string, string>();
    const dentistEndpoints = [
      "/users/list",
      "/users/listUsers",
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
          const id = String(o.ScheduleToId ?? o.PersonId ?? o.Person_Id ?? o.UserId ?? o.User_Id ?? o.id ?? o.Id ?? o.user_id ?? "");
          const name = String(o.ScheduleToName ?? o.Name ?? o.name ?? o.FullName ?? o.full_name ?? o.UserName ?? o.DisplayName ?? o.DentistName ?? "").trim();
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

    if (body.debug_doctor_names === true) {
      return new Response(
        JSON.stringify({ success: true, names: Object.fromEntries(dentistNames.entries()) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2b) Coletar TODOS os IDs de doutor que aparecem na agenda
    const seenDoctorIds = new Set<string>();
    const doctorNamesFromAgenda = new Map<string, string>();
    for (const a of list) {
      const dr = pickDoctor(a);
      if (dr.extId) seenDoctorIds.add(dr.extId);
      if (dr.extId && dr.name && dr.name.trim()) doctorNamesFromAgenda.set(dr.extId, dr.name.trim());
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
      // Only insert new doctors as active; never re-activate ones the admin deactivated.
      const newDoctors = [...seenDoctorIds]
        .filter((extId) => !existingDoctorMap.has(extId))
        .map((extId) => ({
          external_id: extId,
          name: doctorNamesFromAgenda.get(extId) || dentistNames.get(extId) || `Profissional #${extId}`,
          active: true,
        }));
      if (newDoctors.length) {
        const { error: drErr } = await supabase
          .from("clinic_doctors")
          .insert(newDoctors);
        if (drErr) console.error("[clinicorp] doctor insert err:", drErr.message);
      }

      // Para agenda exata, o nome do profissional vem da própria agenda do Clinicorp.
      const namesToApply = new Map([...dentistNames, ...doctorNamesFromAgenda]);
      for (const [extId, realName] of namesToApply) {
        await supabase
          .from("clinic_doctors")
          .update({ name: realName })
          .eq("external_id", extId)
          .or(`name_locked.eq.false,name.ilike.Profissional #%`);
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

    const { data: periodAppointmentsBefore } = await supabase
      .from("clinic_appointments")
      .select("id")
      .gte("appointment_at", start.toISOString())
      .lte("appointment_at", end.toISOString());

    const periodAppointmentIds = (periodAppointmentsBefore || []).map((a) => a.id);
    for (let i = 0; i < periodAppointmentIds.length; i += 200) {
      const slice = periodAppointmentIds.slice(i, i + 200);
      await supabase.from("clinic_daily_tasks").delete().in("appointment_id", slice);
    }
    await supabase
      .from("clinic_daily_tasks")
      .delete()
      .gte("task_date", startKey)
      .lte("task_date", endKey)
      .eq("task_type", "birthday");
    if (periodAppointmentIds.length) {
      const { error: deleteErr } = await supabase
        .from("clinic_appointments")
        .delete()
        .in("id", periodAppointmentIds);
      if (deleteErr) throw new Error(`period appointments delete: ${deleteErr.message}`);
    }

    if (appointmentRows.length) {
      const { error: apptErr } = await supabase
        .from("clinic_appointments")
        .insert(appointmentRows);
      if (apptErr) throw new Error(`appointments insert: ${apptErr.message}`);
      appointmentsCount = appointmentRows.length;
    }

    // 4) Reload appointments to get IDs and link contacts
    let { data: storedAppts } = await supabase
      .from("clinic_appointments")
      .select("id, external_id, patient_external_id, patient_name, patient_phone, doctor_id, doctor_name, appointment_at, contact_id")
      .gte("appointment_at", start.toISOString())
      .lte("appointment_at", end.toISOString());

    console.log(`[clinicorp] rebuilt selected period ${startKey}..${endKey}`);

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
        // Tarefas de preparação (D-7..D-1) só do hoje em diante.
        // A âncora do dia da consulta (offset 0) sempre é gerada.
        if (!rule.keep_past && taskDateStr < todayDateOnly) continue;
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
      for (let i = 0; i <= totalDays; i++) {
        const candidate = new Date(start);
        candidate.setUTCDate(start.getUTCDate() + i);
        const cm = String(candidate.getUTCMonth() + 1).padStart(2, "0");
        const cd = String(candidate.getUTCDate()).padStart(2, "0");
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

    // Remove duplicidades antigas quando o contact_id foi ligado depois da primeira sincronização.
    const taskRowsByKey = new Map<string, Record<string, unknown>>();
    for (const row of taskRows) {
      if (!row.appointment_id) continue;
      taskRowsByKey.set(`${row.appointment_id}:${row.task_type}`, row);
    }
    const appointmentTaskRows = [...taskRowsByKey.values()];

    // 7) Upsert tasks in batches
    let tasksCount = 0;
    const batchSize = 200;
    for (let i = 0; i < appointmentTaskRows.length; i += batchSize) {
      const slice = appointmentTaskRows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("clinic_daily_tasks")
        .upsert(slice, { onConflict: "appointment_id,task_type", ignoreDuplicates: false });
      if (error) {
        console.error("tasks upsert error:", error.message);
      } else {
        tasksCount += slice.length;
      }
    }

    const birthdayRows = taskRows.filter((row) => !row.appointment_id);
    for (let i = 0; i < birthdayRows.length; i += batchSize) {
      const slice = birthdayRows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("clinic_daily_tasks")
        .upsert(slice, { onConflict: "task_type,contact_id,task_date", ignoreDuplicates: false });
      if (error) console.error("birthday tasks upsert error:", error.message);
      else tasksCount += slice.length;
    }

    // 7b) Reconciliação: sincroniza doutor/horário das tarefas com a consulta
    // (corrige tarefas de remarcações e trocas de doutor no Clinicorp).
    const apptIds = (storedAppts || []).map((a) => a.id);
    for (let i = 0; i < apptIds.length; i += 200) {
      const slice = apptIds.slice(i, i + 200);
      const apptsById = new Map(
        (storedAppts || [])
          .filter((a) => slice.includes(a.id))
          .map((a) => [a.id, a]),
      );
      const { data: existingTasks } = await supabase
        .from("clinic_daily_tasks")
        .select("id, appointment_id, doctor_id, doctor_name, appointment_at")
        .in("appointment_id", slice);
      const updates: Record<string, unknown>[] = [];
      for (const t of existingTasks || []) {
        const a = apptsById.get(t.appointment_id);
        if (!a) continue;
        if (
          t.doctor_id !== a.doctor_id ||
          t.doctor_name !== a.doctor_name ||
          t.appointment_at !== a.appointment_at
        ) {
          updates.push({
            id: t.id,
            doctor_id: a.doctor_id,
            doctor_name: a.doctor_name,
            appointment_at: a.appointment_at,
          });
        }
      }
      if (updates.length) {
        const { error: upErr } = await supabase
          .from("clinic_daily_tasks")
          .upsert(updates, { onConflict: "id" });
        if (upErr) console.error("reconcile tasks err:", upErr.message);
        else console.log(`[clinicorp] reconciled ${updates.length} task doctors`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        appointments: appointmentsCount,
        tasks_generated: tasksCount,
        start_date: startKey,
        end_date: endKey,
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
