// Deletes a client's account and their data — coach only, and only for a
// client that belongs to the calling coach.
import { z } from "zod";
import { serviceEndpoint, requireCoach, HttpError } from "../../_lib/fn.js";

const schema = z.object({ clientId: z.string().uuid() });

export default serviceEndpoint({ auth: "user" }, async ({ req, sql, user }) => {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Missing clientId");
  const { clientId } = parsed.data;

  await requireCoach(sql, user!);

  const invite = await sql.query<{ id: string }>(
    `SELECT id FROM public.invitations
      WHERE coach_id = $1 AND accepted_user_id = $2 LIMIT 1`,
    [user!.id, clientId],
  );
  if (invite.rows.length === 0) throw new HttpError(403, "Not your client");

  // Best-effort cleanup of related data (in case no FK cascade exists).
  await sql.query(
    `DELETE FROM public.onboarding_responses WHERE user_id = $1`,
    [clientId],
  );
  await sql.query(`DELETE FROM public.notifications WHERE user_id = $1`, [
    clientId,
  ]);
  await sql.query(`DELETE FROM public.mfp_sessions WHERE user_id = $1`, [
    clientId,
  ]);
  await sql.query(`DELETE FROM public.profiles WHERE user_id = $1`, [clientId]);
  await sql.query(`DELETE FROM public.user_roles WHERE user_id = $1`, [
    clientId,
  ]);
  await sql.query(
    `DELETE FROM public.invitations WHERE accepted_user_id = $1`,
    [clientId],
  );

  // Remove the auth account itself (cascades the remaining owned rows).
  await sql.query(`DELETE FROM auth.users WHERE id = $1`, [clientId]);

  return { success: true };
});
