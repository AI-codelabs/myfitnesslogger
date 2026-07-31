import { supabase } from "@/integrations/supabase/client";

/**
 * Deep-clone a workout plan (including its days and exercises) into a new
 * plan owned by the given coach.
 * Returns the new plan id.
 */
export async function duplicateWorkoutPlan(opts: {
  sourcePlanId: string;
  coachId: string;
  newName: string;
  isTemplate?: boolean;
}): Promise<string> {
  const { sourcePlanId, coachId, newName, isTemplate = false } = opts;

  // 1. Load source plan
  const { data: src, error: srcErr } = await supabase
    .from("workout_plans")
    .select("name, description, category, frequency_per_week")
    .eq("id", sourcePlanId)
    .single();
  if (srcErr || !src) throw srcErr ?? new Error("Plan not found");

  // 2. Create new plan/template owned by the coach.
  const { data: created, error: insErr } = await supabase
    .from("workout_plans")
    .insert({
      name: newName.trim() || `${src.name} (copy)`,
      description: src.description,
      category: src.category,
      frequency_per_week: src.frequency_per_week,
      coach_id: coachId,
      is_template: isTemplate,
      source_plan_id: sourcePlanId,
    })
    .select("id")
    .single();
  if (insErr || !created) throw insErr ?? new Error("Could not create plan");

  // 3. Load source days
  const { data: srcDays, error: daysErr } = await supabase
    .from("workout_plan_days")
    .select("id, name, day_index")
    .eq("plan_id", sourcePlanId)
    .order("day_index", { ascending: true });
  if (daysErr) throw daysErr;

  if (!srcDays || srcDays.length === 0) return created.id;

  // 4. Insert new days
  const { data: newDays, error: newDaysErr } = await supabase
    .from("workout_plan_days")
    .insert(
      srcDays.map((d) => ({
        plan_id: created.id,
        name: d.name,
        day_index: d.day_index,
      })),
    )
    .select("id, day_index");
  if (newDaysErr || !newDays) throw newDaysErr ?? new Error("Could not copy days");

  // Map old day_id -> new day_id (by day_index, unique within a plan)
  const dayMap = new Map<string, string>();
  for (const od of srcDays) {
    const nd = newDays.find((n) => n.day_index === od.day_index);
    if (nd) dayMap.set(od.id, nd.id);
  }

  // 5. Load source exercises
  const { data: srcEx, error: exErr } = await supabase
    .from("workout_plan_exercises")
    .select("day_id, exercise_id, order_index, sets_reps, notes")
    .in(
      "day_id",
      srcDays.map((d) => d.id),
    );
  if (exErr) throw exErr;

  if (srcEx && srcEx.length > 0) {
    const rows = srcEx
      .map((e) => {
        const newDayId = dayMap.get(e.day_id);
        if (!newDayId) return null;
        return {
          day_id: newDayId,
          exercise_id: e.exercise_id,
          order_index: e.order_index,
          sets_reps: e.sets_reps,
          notes: e.notes,
        };
      })
      .filter(Boolean) as Array<{
        day_id: string;
        exercise_id: string;
        order_index: number;
        sets_reps: string | null;
        notes: string | null;
      }>;
    if (rows.length > 0) {
      const { error: insExErr } = await supabase
        .from("workout_plan_exercises")
        .insert(rows);
      if (insExErr) throw insExErr;
    }
  }

  return created.id;
}
