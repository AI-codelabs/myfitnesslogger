const AMSTERDAM_TZ = "Europe/Amsterdam";

function getAmsterdamDateParts(d: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AMSTERDAM_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function getNlIsoWeekday(d: Date = new Date()): number {
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return map[getAmsterdamDateParts(d).weekday.slice(0, 3)] ?? 1;
}

// Calendar week key for check-ins: Monday 00:00 in NL time (e.g. 2026-06-01 for Jun 1-7).
export function getWeekStart(d: Date = new Date()): Date {
  return new Date(`${formatWeekStart(d)}T00:00:00.000Z`);
}

export function formatWeekStart(d: Date = new Date()): string {
  const { year, month, day } = getAmsterdamDateParts(d);
  const weekStart = new Date(Date.UTC(year, month - 1, day));
  weekStart.setUTCDate(weekStart.getUTCDate() - (getNlIsoWeekday(d) - 1));
  return weekStart.toISOString().slice(0, 10);
}

export function addDaysToWeekStart(weekStart: string, days: number): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getPreviousWeekStart(d: Date = new Date()): string {
  return addDaysToWeekStart(formatWeekStart(d), -7);
}

export function getWeekEnd(weekStart: string): string {
  return addDaysToWeekStart(weekStart, 6);
}

export function getNlWeekday(d: Date = new Date()): number {
  // 0 = Sunday ... 6 = Saturday, computed in Europe/Amsterdam time
  const s = getAmsterdamDateParts(d).weekday;
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[s.slice(0, 3)] ?? d.getDay();
}

export function isCheckinWindowOpen(d: Date = new Date()): boolean {
  // The latest fully completed Monday-Sunday week should always stay available
  // until the client submits it.
  return true;
}

export function getExpectedCheckinWeekStart(d: Date = new Date()): string {
  return getPreviousWeekStart(d);
}

export function formatHumanDate(iso: string, lang: "nl" | "en"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
