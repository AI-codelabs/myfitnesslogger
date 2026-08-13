import { db } from "@/lib/db";

export type GoalType = "cut" | "bulk" | "maintain" | "custom";

export interface ClientGoal {
  id: string;
  client_id: string;
  goal_type: GoalType;
  goal_label: string | null;
  goal_weight_kg: number | null;
  starting_weight_kg: number | null;
  target_date: string | null;
  maintenance_calories: number | null;
  activity_level: string | null;
  weekly_drift_tolerance_kg: number | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const GOAL_TYPE_LABELS: Record<GoalType, { nl: string; en: string }> = {
  cut:     { nl: "Vet verliezen / Cutten",  en: "Fat loss / Cutting" },
  bulk:    { nl: "Spiermassa / Bulken",     en: "Muscle gain / Bulking" },
  maintain:{ nl: "Onderhoud",                en: "Maintenance" },
  custom:  { nl: "Aangepast doel",          en: "Custom goal" },
};

/** Fetch the currently-active goal for a client (single source of truth for AI + UI). */
export async function fetchActiveGoal(clientId: string): Promise<ClientGoal | null> {
  const { data } = await db
    .from("client_goals")
    .select("*")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ClientGoal | null) ?? null;
}

/**
 * Decide whether a weight delta is "good" given the active goal.
 *  cut       → losing weight is good
 *  bulk      → gaining weight is good
 *  maintain  → within tolerance band is good (neutral colouring outside)
 *  custom/—  → neutral, no good/bad colouring
 */
export type ProgressVerdict = {
  /** true = positive (green), false = negative (red), null = neutral (gray) */
  good: boolean | null;
  /** UX hint: should we draw colour at all, or stay neutral? */
  neutral: boolean;
};

export function judgeWeightChange(
  deltaKg: number,
  goal: Pick<ClientGoal, "goal_type" | "weekly_drift_tolerance_kg"> | null,
): ProgressVerdict {
  if (!goal) return { good: null, neutral: true };
  const t = Math.abs(goal.weekly_drift_tolerance_kg ?? 0.3);
  switch (goal.goal_type) {
    case "cut":
      if (Math.abs(deltaKg) < 0.05) return { good: null, neutral: false };
      return { good: deltaKg < 0, neutral: false };
    case "bulk":
      if (Math.abs(deltaKg) < 0.05) return { good: null, neutral: false };
      return { good: deltaKg > 0, neutral: false };
    case "maintain":
      return { good: Math.abs(deltaKg) <= t, neutral: false };
    case "custom":
    default:
      return { good: null, neutral: true };
  }
}
