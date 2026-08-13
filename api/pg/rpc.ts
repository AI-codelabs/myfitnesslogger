import { z } from "zod";
import { endpoint } from "../_lib/handler.js";
import { HttpError } from "../_lib/auth.js";
import { ident } from "../_lib/query.js";
import { requireOwnClient } from "../_lib/fn.js";

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

export default endpoint({ method: "POST", schema }, async ({ sql, user, input }) => {
  const allowed = ALLOWED_RPCS[input.fn];
  if (!allowed) throw new Error(`function not allowed: ${input.fn}`);

  const names = Object.keys(input.args);
  for (const name of names) {
    if (!allowed.includes(name)) throw new Error(`unexpected argument: ${name}`);
  }

  // SECURITY DEFINER helpers must not be callable for arbitrary third parties.
  if (input.fn === "get_clients_last_active") {
    if (String(input.args._coach_id) !== user.id) {
      throw new HttpError(403, "Coach id must match the signed-in user");
    }
  }
  if (input.fn === "get_active_client_goal") {
    await requireOwnClient(sql, user, String(input.args._client_id));
  }
  if (input.fn === "has_role") {
    if (String(input.args._user_id) !== user.id) {
      throw new HttpError(403, "Role checks are only allowed for the signed-in user");
    }
  }
  if (input.fn === "is_coach_of") {
    if (String(input.args._coach_id) !== user.id) {
      throw new HttpError(403, "Relationship checks are only allowed for the signed-in user");
    }
  }

  const params = names.map((n) => input.args[n]);
  const call = names.map((n, i) => `${ident(n.replace(/^_/, "_"))} => $${i + 1}`).join(", ");
  const { rows } = await sql.query(
    `SELECT * FROM public.${ident(input.fn)}(${call})`,
    params,
  );
  return rows;
});
