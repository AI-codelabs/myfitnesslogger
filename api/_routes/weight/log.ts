import { z } from "zod";
import { endpoint } from "../../_lib/handler.js";
import { requireOwnClient } from "../../_lib/fn.js";

const schema = z.object({
  loggedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: z.number().min(20).max(400),
  note: z.string().max(500).nullish(),
  clientId: z.string().uuid().optional(),
});

export default endpoint({ method: "POST", schema }, async ({ sql, user, input }) => {
  const clientId = input.clientId ?? user.id;
  await requireOwnClient(sql, user, clientId);
  const { rows } = await sql.query(
    `INSERT INTO public.weight_logs (client_id, logged_on, weight_kg, note)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (client_id, logged_on)
     DO UPDATE SET weight_kg = EXCLUDED.weight_kg,
                   note = EXCLUDED.note,
                   updated_at = now()
     RETURNING id, client_id, logged_on, weight_kg, note`,
    [clientId, input.loggedOn, input.weightKg, input.note ?? null],
  );
  return rows[0];
});
