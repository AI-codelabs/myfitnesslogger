import { z } from "zod";
import { endpoint } from "../_lib/handler.js";

const schema = z.object({ id: z.string().uuid() });

export default endpoint({ method: "POST", schema }, async ({ sql, input }) => {
  // RLS decides whether this row belongs to the caller.
  const { rowCount } = await sql.query(
    `DELETE FROM public.weight_logs WHERE id = $1`,
    [input.id],
  );
  return { deleted: rowCount ?? 0 };
});
