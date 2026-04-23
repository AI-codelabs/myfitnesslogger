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

export function isCheckinWindowOpen(d: Date = new Date()): boolean {
  // "From Sunday until done" — show prompt from Sunday 00:00 onwards of the current week.
  // We treat the week as starting Monday; the "Sunday until done" applies to the week
  // that just ended. So show the prompt if today is Sunday or later (i.e. always once the
  // week's Sunday has arrived) until they submit a check-in for that week.
  return d.getDay() === 0 || d.getDay() === 1; // Sun or Mon — keep visible into Monday for late submitters
}

export function formatHumanDate(iso: string, lang: "nl" | "en"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
