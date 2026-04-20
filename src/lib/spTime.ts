/**
 * Helpers for São Paulo timezone (America/Sao_Paulo, UTC-3 with no DST since 2019).
 * We do NOT depend on user's local clock; we always project to SP.
 */

const SP_TZ = "America/Sao_Paulo";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fmtTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** YYYY-MM-DD of the current date in São Paulo. */
export function spToday(): string {
  return fmt.format(new Date());
}

/** YYYY-MM-DD for an arbitrary Date in São Paulo. */
export function spDate(d: Date): string {
  return fmt.format(d);
}

/** HH:mm:ss in São Paulo. */
export function spClock(d: Date = new Date()): string {
  return fmtTime.format(d);
}

/** YYYY-MM-DD of N days ago (SP). */
export function spDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return spDate(d);
}

/** Start of current ISO week (Mon) in SP, returned as YYYY-MM-DD. */
export function spWeekStart(): string {
  const now = new Date();
  // Build "now in SP" by parsing the formatted parts
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  const sp = new Date(`${year}-${month}-${day}T00:00:00`);
  // Monday = 1
  const dow = sp.getDay() === 0 ? 7 : sp.getDay();
  sp.setDate(sp.getDate() - (dow - 1));
  const y = sp.getFullYear();
  const m = String(sp.getMonth() + 1).padStart(2, "0");
  const d2 = String(sp.getDate()).padStart(2, "0");
  return `${y}-${m}-${d2}`;
}

/** First day of the current month in SP. */
export function spMonthStart(): string {
  const today = spToday(); // YYYY-MM-DD
  return today.slice(0, 7) + "-01";
}

/** First day of the current year in SP. */
export function spYearStart(): string {
  return spToday().slice(0, 4) + "-01-01";
}

/** Format minutes as Hh Mm (e.g. 1h 24min). */
export function fmtMinutes(min: number): string {
  if (!min || min < 1) return "0min";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}
