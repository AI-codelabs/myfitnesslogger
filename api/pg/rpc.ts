import { z } from "zod";
import { endpoint } from "../_lib/handler.js";
import { ident } from "../_lib/query.js";

/** Database functions the frontend may call, with their parameter names. */
const ALLOWED_RPCS: Record<string, string[]> = {
  get_clients_last_active: ["_coach_id"],
  get_active_client_goal: ["_client_id"],
  has_role: ["_user_id", "_role"],
  is_coach_of: ["_coach_id", "_client_id"],
};

const schema = z.object({
  fn: z.string(),
  args: z.record(z.unknown()).default({}),
});

export default endpoint({ method: "POST", schema }, async ({ sql, input }) => {
  const allowed = ALLOWED_RPCS[input.fn];
  if (!allowed) throw new Error(`function not allowed: ${input.fn}`);

  const names = Object.keys(input.args);
  for (const name of names) {
    if (!allowed.includes(name)) throw new Error(`unexpected argument: ${name}`);
  }

  const params = names.map((n) => input.args[n]);
  const call = names.map((n, i) => `${ident(n.replace(/^_/, "_"))} => $${i + 1}`).join(", ");
  const { rows } = await sql.query(
    `SELECT * FROM public.${ident(input.fn)}(${call})`,
    params,
  );
  return rows;
});
