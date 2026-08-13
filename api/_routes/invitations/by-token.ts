import { HttpError } from "../../_lib/auth.js";
import { serviceEndpoint } from "../../_lib/fn.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public invite lookup. Replaces the legacy SECURITY DEFINER RPC
 * `get_invitation_by_token`, which invitees call before they have an account.
 */
export default serviceEndpoint({ auth: "public", methods: ["GET"] }, async ({ req, sql }) => {
  const raw = req.query.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || !UUID.test(token)) throw new HttpError(400, "invalid_token");
  const { rows } = await sql.query<{ id: string; email: string; status: string }>(
    `SELECT id, email, status FROM public.get_invitation_by_token($1::uuid)`,
    [token],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, "not_found");
  return row;
});
