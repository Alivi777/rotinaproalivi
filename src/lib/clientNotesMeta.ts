/**
 * Helpers para extrair metadados estruturados das notes dos cards de cliente
 * gerados pela edge function `clinic-tasks-to-reception`.
 *
 * Tags suportadas (em qualquer linha das notes):
 *   [doctor:Nome|#cor]
 *   [task_date:YYYY-MM-DD]
 *   [tasks:uuid1,uuid2]
 */

export type ClientNotesMeta = {
  doctorName: string | null;
  doctorColor: string | null;
  taskDate: string | null; // YYYY-MM-DD
  taskIds: string[];
};

const DOCTOR_RE = /\[doctor:([^|\]]+)\|([^\]]*)\]/;
const TASK_DATE_RE = /\[task_date:(\d{4}-\d{2}-\d{2})\]/;
const TASKS_RE = /\[tasks:([^\]]+)\]/;

export function parseClientNotesMeta(notes: string | null | undefined): ClientNotesMeta {
  const meta: ClientNotesMeta = {
    doctorName: null,
    doctorColor: null,
    taskDate: null,
    taskIds: [],
  };
  if (!notes) return meta;
  const dm = notes.match(DOCTOR_RE);
  if (dm) {
    meta.doctorName = dm[1].trim() || null;
    const c = (dm[2] || "").trim();
    meta.doctorColor = c || null;
  }
  const td = notes.match(TASK_DATE_RE);
  if (td) meta.taskDate = td[1];
  const tt = notes.match(TASKS_RE);
  if (tt) {
    meta.taskIds = tt[1]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return meta;
}

/** Remove as tags [tag:...] das notes para exibição amigável. */
export function stripMetaTags(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .replace(DOCTOR_RE, "")
    .replace(TASK_DATE_RE, "")
    .replace(TASKS_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Rótulo do dia da semana (pt-BR) com base em YYYY-MM-DD. */
export function weekdayLabelFromDate(dateStr: string): string {
  // Trata como local (sem fuso) para evitar shift
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("pt-BR", { weekday: "long" });
}

/** "Hoje", "Amanhã", "Segunda 21/04" etc. — relativo a hoje (timezone local). */
export function relativeDayLabel(dateStr: string): string {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const tomorrow = new Date(today.getTime() + 86400000);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  if (dateStr === todayKey) return "Hoje";
  if (dateStr === tomorrowKey) return "Amanhã";
  const wd = weekdayLabelFromDate(dateStr);
  const [, m, d] = dateStr.split("-");
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d}/${m}`;
}
