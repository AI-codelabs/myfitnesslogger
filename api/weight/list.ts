import { z } from "zod";
import { endpoint } from "../_lib/handler";

const schema = z.object({
  clientId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export default endpoint({ method: "GET", schema }, async ({ sql, user, input }) => {
  const clientId = input.clientId ?? user.id;
  const { rows } = await sql.query(
    `SELECT id, client_id, logged_on, weight_kg, note, created_at
       FROM public.weight_logs
      WHERE client_id = $1
        AND ($2::date IS NULL OR logged_on >= $2::date)
        AND ($3::date IS NULL OR logged_on <= $3::date)
      ORDER BY logged_on DESC
      LIMIT $4`,
    [clientId, input.from ?? null, input.to ?? null, input.limit],
  );
  return rows;
});
