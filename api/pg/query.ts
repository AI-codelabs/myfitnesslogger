import { endpoint } from "../_lib/handler.js";
import { buildQuery, querySchema } from "../_lib/query.js";

/**
 * Generic, RLS-enforced query endpoint. The frontend shim (src/lib/api/pg.ts)
 * sends a description of the operation; everything runs inside a transaction
 * that impersonates the signed-in user, so the migrated policies apply.
 */
export default endpoint({ method: "POST", schema: querySchema }, async ({ sql, input }) => {
  const { text, params } = buildQuery(input);
  const { rows } = await sql.query(text, params);

  if (input.single === "one") {
    if (rows.length !== 1) throw new Error(`expected exactly one row, got ${rows.length}`);
    return rows[0];
  }
  if (input.single === "maybe") {
    if (rows.length > 1) throw new Error(`expected at most one row, got ${rows.length}`);
    return rows[0] ?? null;
  }
  return rows;
});
