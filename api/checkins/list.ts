import { z } from "zod";
import { endpoint } from "../_lib/handler";

const schema = z.object({
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(52),
});

export default endpoint({ method: "GET", schema }, async ({ sql, user, input }) => {
  const clientId = input.clientId ?? user.id;
  const { rows } = await sql.query(
    `SELECT *
       FROM public.weekly_checkins
      WHERE client_id = $1
      ORDER BY week_start DESC
      LIMIT $2`,
    [clientId, input.limit],
  );
  return rows;
});
