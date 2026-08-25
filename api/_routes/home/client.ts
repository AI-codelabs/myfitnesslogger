import { z } from "zod";
import { endpoint } from "../../_lib/handler.js";

const schema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * One RLS transaction for the client home screen — replaces ~10 separate
 * /api/pg/query round-trips that were making sections pop in late.
 */
export default endpoint({ method: "GET", schema }, async ({ sql, user, input }) => {
  const uid = user.id;
  const { weekStart, today } = input;

  const [
    profileRes,
    checkinRes,
    sessionsRes,
    weeklyRes,
    startMsgRes,
    planRes,
    nutritionLogRes,
    complianceRes,
    goalRes,
    weightRes,
    progressionRes,
  ] = await Promise.all([
    sql.query<{ first_name: string | null; display_name: string | null }>(
      `SELECT first_name, display_name FROM public.profiles WHERE user_id = $1 LIMIT 1`,
      [uid],
    ),
    sql.query<{ submitted_at: string | null }>(
      `SELECT submitted_at FROM public.weekly_checkins
        WHERE client_id = $1 AND week_start = $2::date LIMIT 1`,
      [uid, weekStart],
    ),
    sql.query<{ id: string; completed_at: string | null }>(
      `SELECT id, completed_at FROM public.workout_sessions
        WHERE client_id = $1 AND scheduled_date = $2::date`,
      [uid, today],
    ),
    sql.query(
      `SELECT voice_memo, client_positive, client_attention, client_actions, published_at, week_start
         FROM public.weekly_review_drafts
        WHERE client_id = $1 AND published_at IS NOT NULL
        ORDER BY week_start DESC LIMIT 1`,
      [uid],
    ),
    sql.query(
      `SELECT voice_memo, client_positive, client_attention, client_actions, published_at
         FROM public.coach_messages
        WHERE client_id = $1 AND published_at IS NOT NULL
        LIMIT 1`,
      [uid],
    ),
    sql.query<{ details: unknown }>(
      `SELECT details FROM public.nutrition_plans
        WHERE client_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [uid],
    ),
    sql.query<{
      calories: number | null;
      protein_g: number | null;
      carbs_g: number | null;
      fat_g: number | null;
    }>(
      `SELECT calories, protein_g, carbs_g, fat_g
         FROM public.cronometer_nutrition_logs
        WHERE client_id = $1 AND log_date = $2::date LIMIT 1`,
      [uid, today],
    ),
    sql.query<{ log_date: string }>(
      `SELECT log_date::text AS log_date
         FROM public.cronometer_nutrition_logs
        WHERE client_id = $1
          AND log_date >= (CURRENT_DATE - INTERVAL '30 days')`,
      [uid],
    ),
    sql.query(
      `SELECT * FROM public.client_goals
        WHERE client_id = $1 AND is_active = true
        ORDER BY created_at DESC LIMIT 1`,
      [uid],
    ),
    sql.query<{ weight_kg: number }>(
      `SELECT weight_kg FROM public.weight_logs
        WHERE client_id = $1
        ORDER BY logged_on DESC LIMIT 1`,
      [uid],
    ),
    sql.query<{
      week_start: string;
      weight_kg: number | null;
      body_fat_pct: number | null;
    }>(
      `SELECT week_start::text AS week_start, weight_kg, body_fat_pct
         FROM public.weekly_checkins
        WHERE client_id = $1
        ORDER BY week_start ASC`,
      [uid],
    ),
  ]);

  return {
    profile: profileRes.rows[0] ?? null,
    checkinSubmittedAt: checkinRes.rows[0]?.submitted_at ?? null,
    todaySessions: sessionsRes.rows,
    weeklyMessage: weeklyRes.rows[0] ?? null,
    startMessage: startMsgRes.rows[0] ?? null,
    nutritionPlanDetails: planRes.rows[0]?.details ?? null,
    nutritionToday: nutritionLogRes.rows[0] ?? null,
    nutritionLogDates: complianceRes.rows.map((r) => r.log_date),
    goal: goalRes.rows[0] ?? null,
    latestWeightKg: weightRes.rows[0]?.weight_kg ?? null,
    progressionCheckins: progressionRes.rows,
    weekStart,
    today,
  };
});
