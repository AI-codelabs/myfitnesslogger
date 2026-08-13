import { z } from "zod";
import { endpoint } from "../../_lib/handler.js";

const schema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: z.number().min(20).max(400),
  details: z.record(z.unknown()).default({}),
  fields: z.record(z.unknown()).default({}),
});

/** Column allow-list mirrors public.weekly_checkins; anything else lands in details. */
const COLUMNS = new Set([
  "training_count",
  "training_count_other",
  "intensity_rpe",
  "progression",
  "nutrition_stars",
  "nutrition_deviations",
  "cravings",
  "sleep_cycle",
  "sleep_cycle_other",
  "energy",
  "soreness",
  "measurements",
  "body_fat_pct",
  "feeling",
  "structure_planning",
  "progress_feeling",
  "obstacles",
  "supplements_consistency",
  "hydration",
  "other_notes",
]);

export default endpoint({ method: "POST", schema }, async ({ sql, user, input }) => {
  const cols = ["client_id", "week_start", "weight_kg", "details"];
  const values: unknown[] = [
    user.id,
    input.weekStart,
    input.weightKg,
    JSON.stringify(input.details),
  ];

  for (const [key, value] of Object.entries(input.fields)) {
    if (!COLUMNS.has(key) || value === undefined) continue;
    cols.push(key);
    values.push(value);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  const updates = cols
    .filter((c) => c !== "client_id" && c !== "week_start")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");

  const { rows } = await sql.query(
    `INSERT INTO public.weekly_checkins (${cols.join(", ")})
     VALUES (${placeholders})
     ON CONFLICT (client_id, week_start)
     DO UPDATE SET ${updates}, submitted_at = now(), updated_at = now()
     RETURNING *`,
    values,
  );
  return rows[0];
});
