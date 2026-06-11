// Workout schedule computation utilities.
//
// Combines recurring `client_workout_assignments` with per-instance
// `workout_schedule_overrides` (move / copy / delete) to produce the final
// set of scheduled workout occurrences on the calendar.

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface AssignmentLike {
  id: string;
  plan_id: string;
  is_active: boolean;
  start_date: string | null;
  weeks: number | null;
  days: string[] | null;
}

export interface OverrideLike {
  id: string;
  client_id: string;
  assignment_id: string | null;
  plan_id: string;
  action: "move" | "copy" | "delete";
  original_date: string | null;
  scheduled_date: string | null;
  occurrence_index: number | null;
  source_override_id: string | null;
}

export interface ComputedOccurrence {
  /** Stable key for the occurrence (used to identify it for actions) */
  key: string;
  /** The assignment that originally generated this occurrence (if any) */
  assignmentId: string | null;
  planId: string;
  planName: string;
  /** 1-based position within the assignment's recurrence (if any) */
  occurrenceIndex: number | null;
  /** Date the occurrence currently appears on */
  scheduledDate: string;
  /** Original date (before any move). For copies this is the source date. */
  originalDate: string | null;
  /** Identifies how this occurrence reached the calendar. */
  origin: "planned" | "moved" | "copied";
  /** The override row id when origin !== 'planned'. */
  overrideId: string | null;
  /** Whether this came from an active, recurring assignment (vs. a one-off). */
  isRecurring: boolean;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Parse a YYYY-MM-DD date string as local-midnight (avoids UTC tz drift). */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Compute all calendar occurrences (planned + overrides), grouped by date key (YYYY-MM-DD). */
export function computeScheduledOccurrences(
  assignments: AssignmentLike[],
  overrides: OverrideLike[],
  planName: (planId: string) => string,
): Map<string, ComputedOccurrence[]> {
  // Index overrides for fast lookup by (assignmentId, occurrenceIndex)
  const moveMap = new Map<string, OverrideLike>();
  const deleteSet = new Set<string>();
  for (const ov of overrides) {
    if (!ov.assignment_id || ov.occurrence_index == null) continue;
    const k = `${ov.assignment_id}:${ov.occurrence_index}`;
    if (ov.action === "delete") deleteSet.add(k);
    else if (ov.action === "move") moveMap.set(k, ov);
  }

  const map = new Map<string, ComputedOccurrence[]>();
  const push = (dateKey: string, occ: ComputedOccurrence) => {
    const arr = map.get(dateKey) ?? [];
    arr.push(occ);
    map.set(dateKey, arr);
  };

  // 1. Expand recurring assignments, applying delete/move overrides.
  for (const a of assignments) {
    if (!a.is_active || !a.start_date || !a.weeks || !a.days || a.days.length === 0) continue;
    const isRecurring = (a.weeks ?? 1) * (a.days?.length ?? 0) > 1;
    const start = startOfDay(parseLocalDate(a.start_date));
    const totalDays = a.weeks * 7;
    let occurrence = 0;
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(start, i);
      const dk = DAY_KEYS[d.getDay()];
      if (!a.days.includes(dk)) continue;
      occurrence++;
      const key = `${a.id}:${occurrence}`;
      if (deleteSet.has(key)) continue;
      const originalDate = formatDateKey(d);
      const move = moveMap.get(key);
      const scheduledDate = move?.scheduled_date ?? originalDate;
      push(scheduledDate, {
        key: move ? `mv:${move.id}` : `pl:${a.id}:${occurrence}`,
        assignmentId: a.id,
        planId: a.plan_id,
        planName: planName(a.plan_id),
        occurrenceIndex: occurrence,
        scheduledDate,
        originalDate,
        origin: move ? "moved" : "planned",
        overrideId: move?.id ?? null,
        isRecurring,
      });
    }
  }

  // 2. Add copy overrides as standalone occurrences.
  for (const ov of overrides) {
    if (ov.action !== "copy" || !ov.scheduled_date) continue;
    push(ov.scheduled_date, {
      key: `cp:${ov.id}`,
      assignmentId: ov.assignment_id,
      planId: ov.plan_id,
      planName: planName(ov.plan_id),
      occurrenceIndex: ov.occurrence_index,
      scheduledDate: ov.scheduled_date,
      originalDate: ov.original_date,
      origin: "copied",
      overrideId: ov.id,
      isRecurring: false,
    });
  }

  return map;
}

export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
