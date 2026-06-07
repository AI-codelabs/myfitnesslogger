// Helpers for ISO week start (Monday) in client local time.
export function getWeekStart(d: Date = new Date()): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0 ? -6 : 1 - day); // back to Monday
  date.setDate(date.getDate() + diff);
  return date;
}

export function formatWeekStart(d: Date = new Date()): string {
  // YYYY-MM-DD
  const w = getWeekStart(d);
  const y = w.getFullYear();
  const m = String(w.getMonth() + 1).padStart(2, "0");
  const day = String(w.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getNlWeekday(d: Date = new Date()): number {
  // 0 = Sunday ... 6 = Saturday, computed in Europe/Amsterdam time
  const s = d.toLocaleString("en-US", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
  });
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[s.slice(0, 3)] ?? d.getDay();
}

export function isCheckinWindowOpen(d: Date = new Date()): boolean {
  // Window opens Sunday 00:00 Europe/Amsterdam and stays open through Monday
  // (so late submitters can still fill it in on Monday).
  const wd = getNlWeekday(d);
  return wd === 0 || wd === 1;
}

export function formatHumanDate(iso: string, lang: "nl" | "en"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
