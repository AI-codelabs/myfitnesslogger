import { z } from "zod";
import { endpoint } from "../../_lib/handler.js";

const schema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Coach home bootstrap: invitations + profiles/goals/checkins/messages in one
 * RLS transaction instead of 7 sequential HTTP round-trips.
 */
export default endpoint({ method: "GET", schema }, async ({ sql, user }) => {
  const coachId = user.id;

  const { rows: invs } = await sql.query<{
    id: string;
    email: string;
    status: string;
    accepted_user_id: string | null;
    accepted_at: string | null;
    created_at: string;
    coaching_start_date: string | null;
    coaching_end_date: string | null;
  }>(
    `SELECT id, email, status, accepted_user_id, accepted_at, created_at,
            coaching_start_date, coaching_end_date
       FROM public.invitations
      WHERE coach_id = $1`,
    [coachId],
  );

  const accepted = invs.filter(
    (i) =>
      i.accepted_user_id &&
      ["onboarding", "active", "accepted", "inactive"].includes(i.status),
  );
  const pendingInvites = invs
    .filter((i) => i.status === "pending")
    .map((i) => ({ id: i.id, email: i.email, created_at: i.created_at }));

  const clientIds = accepted
    .map((i) => i.accepted_user_id)
    .filter((id): id is string => !!id);

  if (clientIds.length === 0) {
    return {
      invitations: accepted,
      pendingInvites,
      profiles: [],
      onboarding: [],
      goals: [],
      checkins: [],
      messages: [],
      reviews: [],
    };
  }

  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 7 * 8);
  const lookbackIso = lookback.toISOString().slice(0, 10);

  const [profiles, onboarding, goals, checkins, messages, reviews] = await Promise.all([
    sql.query(
      `SELECT user_id, display_name, first_name, last_name
         FROM public.profiles WHERE user_id = ANY($1::uuid[])`,
      [clientIds],
    ),
    sql.query(
      `SELECT user_id, completed_at, primary_goal
         FROM public.onboarding_responses WHERE user_id = ANY($1::uuid[])`,
      [clientIds],
    ),
    sql.query(
      `SELECT client_id, goal_type, goal_weight_kg, weekly_drift_tolerance_kg, is_active, created_at
         FROM public.client_goals
        WHERE client_id = ANY($1::uuid[]) AND is_active = true`,
      [clientIds],
    ),
    sql.query(
      `SELECT id, client_id, week_start, submitted_at, feeling, energy, progression,
              nutrition_stars, supplements_consistency, weight_kg, obstacles,
              progress_feeling, cravings, other_notes
         FROM public.weekly_checkins
        WHERE client_id = ANY($1::uuid[]) AND week_start >= $2::date
        ORDER BY week_start DESC`,
      [clientIds, lookbackIso],
    ),
    sql.query(
      `SELECT client_id, published_at, generated_at
         FROM public.coach_messages
        WHERE coach_id = $1 AND client_id = ANY($2::uuid[])`,
      [coachId, clientIds],
    ),
    sql.query(
      `SELECT client_id, week_start, published_at
         FROM public.weekly_review_drafts
        WHERE coach_id = $1 AND client_id = ANY($2::uuid[])`,
      [coachId, clientIds],
    ),
  ]);

  return {
    invitations: accepted,
    pendingInvites,
    profiles: profiles.rows,
    onboarding: onboarding.rows,
    goals: goals.rows,
    checkins: checkins.rows,
    messages: messages.rows,
    reviews: reviews.rows,
  };
});
