import { db } from "@/lib/db";

export function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoKey(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return toKey(d);
}

export interface ComplianceStats {
  daysSet: Set<string>;
  currentStreak: number;
  loggedLast7: number;
  loggedLast30: number;
}

function computeStreak(daysSet: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // Allow today to not be logged yet — start counting from yesterday if today missing
  if (!daysSet.has(toKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (daysSet.has(toKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function fetchCompliance(clientId: string, days = 30): Promise<ComplianceStats> {
  const since = daysAgoKey(days - 1);
  const { data } = await db
    .from("cronometer_nutrition_logs")
    .select("log_date")
    .eq("client_id", clientId)
    .gte("log_date", since);
  const daysSet = new Set<string>((data ?? []).map((r: any) => r.log_date));
  const cutoff7 = daysAgoKey(6);
  let loggedLast7 = 0;
  daysSet.forEach((d) => {
    if (d >= cutoff7) loggedLast7++;
  });
  return {
    daysSet,
    currentStreak: computeStreak(daysSet),
    loggedLast7,
    loggedLast30: daysSet.size,
  };
}

/** Batch fetch last-7-day logged counts for many clients (coach dashboard). */
export async function fetchLoggedLast7Batch(
  clientIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (clientIds.length === 0) return out;
  const since = daysAgoKey(6);
  const { data } = await db
    .from("cronometer_nutrition_logs")
    .select("client_id, log_date")
    .in("client_id", clientIds)
    .gte("log_date", since);
  clientIds.forEach((id) => (out[id] = 0));
  (data ?? []).forEach((r: any) => {
    out[r.client_id] = (out[r.client_id] ?? 0) + 1;
  });
  return out;
}

/** Build ordered [oldest..today] list of {date, logged} for a heatmap. */
export function buildHeatmap(daysSet: Set<string>, days = 30) {
  const arr: { date: string; logged: boolean }[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = toKey(d);
    arr.push({ date: key, logged: daysSet.has(key) });
  }
  return arr;
}
