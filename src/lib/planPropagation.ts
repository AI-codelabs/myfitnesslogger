import { db } from "@/lib/db";

export type DerivedClientPlan = {
  assignmentId: string;
  clientId: string;
  clientName: string;
  planId: string;
  planName: string;
  /** true when the client is assigned to the template itself (edits are already live) */
  live: boolean;
};

/**
 * Find every client that is affected by an edit to `planId`.
 *  - "live" clients are assigned directly to this plan/template: they already
 *    see the changes, nothing to push.
 *  - the others are assigned to a personal copy that was cloned from this plan
 *    (workout_plans.source_plan_id = planId); those can optionally be re-synced.
 */
export async function listDerivedClientPlans(planId: string): Promise<DerivedClientPlan[]> {
  const { data: copies } = await db
    .from("workout_plans")
    .select("id, name")
    .eq("source_plan_id", planId);

  const planIds = [planId, ...((copies ?? []).map((p: any) => p.id) as string[])];
  const nameById = new Map<string, string>((copies ?? []).map((p: any) => [p.id, p.name]));

  const { data: assignments } = await db
    .from("client_workout_assignments")
    .select("id, client_id, plan_id")
    .in("plan_id", planIds);

  const rows = assignments ?? [];
  if (rows.length === 0) return [];

  const clientIds = Array.from(new Set(rows.map((a: any) => a.client_id)));
  const { data: profiles } = await db
    .from("profiles")
    .select("user_id, display_name, first_name, last_name")
    .in("user_id", clientIds);

  const labelFor = (id: string) => {
    const p: any = (profiles ?? []).find((x: any) => x.user_id === id);
    if (!p) return "Client";
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return full || p.display_name || "Client";
  };

  return rows.map((a: any) => ({
    assignmentId: a.id,
    clientId: a.client_id,
    clientName: labelFor(a.client_id),
    planId: a.plan_id,
    planName: a.plan_id === planId ? "" : (nameById.get(a.plan_id) ?? ""),
    live: a.plan_id === planId,
  }));
}

/**
 * Overwrite the content (days + exercises) of `targetPlanId` with the content
 * of `sourcePlanId`. The target plan keeps its own name/owner so the client
 * copy stays a separate plan.
 */
export async function syncPlanContent(sourcePlanId: string, targetPlanId: string): Promise<void> {
  if (sourcePlanId === targetPlanId) return;

  const [{ data: src }, { data: srcDays }] = await Promise.all([
    db
      .from("workout_plans")
      .select("description, category, frequency_per_week")
      .eq("id", sourcePlanId)
      .single(),
    db
      .from("workout_plan_days")
      .select("id, name, day_index")
      .eq("plan_id", sourcePlanId)
      .order("day_index"),
  ]);

  if (src) {
    await db
      .from("workout_plans")
      .update({
        description: src.description,
        category: src.category,
        frequency_per_week: src.frequency_per_week,
      })
      .eq("id", targetPlanId);
  }

  // Wipe existing content (exercises cascade with their day)
  const { error: delErr } = await db
    .from("workout_plan_days")
    .delete()
    .eq("plan_id", targetPlanId);
  if (delErr) throw delErr;

  if (!srcDays || srcDays.length === 0) return;

  const { data: newDays, error: dayErr } = await db
    .from("workout_plan_days")
    .insert(
      srcDays.map((d: any) => ({
        plan_id: targetPlanId,
        name: d.name,
        day_index: d.day_index,
      })),
    )
    .select("id, day_index");
  if (dayErr || !newDays) throw dayErr ?? new Error("Could not copy days");

  const dayMap = new Map<string, string>();
  for (const od of srcDays as any[]) {
    const nd = newDays.find((n: any) => n.day_index === od.day_index);
    if (nd) dayMap.set(od.id, nd.id);
  }

  const { data: srcEx, error: exErr } = await db
    .from("workout_plan_exercises")
    .select("day_id, exercise_id, order_index, sets_reps, notes")
    .in(
      "day_id",
      (srcDays as any[]).map((d) => d.id),
    );
  if (exErr) throw exErr;

  const rows = (srcEx ?? [])
    .map((e: any) => ({
      day_id: dayMap.get(e.day_id),
      exercise_id: e.exercise_id,
      order_index: e.order_index,
      sets_reps: e.sets_reps,
      notes: e.notes,
    }))
    .filter((r) => !!r.day_id);

  if (rows.length) {
    const { error } = await db.from("workout_plan_exercises").insert(rows as any);
    if (error) throw error;
  }
}
