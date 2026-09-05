import { z } from "zod";
import { endpoint } from "../../_lib/handler.js";
import { requireOwnClient } from "../../_lib/fn.js";

const schema = z.object({
  clientId: z.string().uuid(),
});

/** Creates missing weekly_review_drafts for submitted check-ins (historical backfill). */
export default endpoint({ method: "POST", schema }, async ({ sql, user, input }) => {
  await requireOwnClient(sql, user, input.clientId);

  const { rowCount } = await sql.query(
    `INSERT INTO public.weekly_review_drafts (coach_id, client_id, week_start, checkin_id)
     SELECT $1::uuid, c.client_id, c.week_start, c.id
       FROM public.weekly_checkins c
      WHERE c.client_id = $2::uuid
        AND c.submitted_at IS NOT NULL
     ON CONFLICT (coach_id, client_id, week_start) DO UPDATE
       SET checkin_id = COALESCE(public.weekly_review_drafts.checkin_id, EXCLUDED.checkin_id)`,
    [user.id, input.clientId],
  );

  return { ensured: rowCount ?? 0 };
});
