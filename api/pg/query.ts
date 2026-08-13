import { endpoint } from "../_lib/handler.js";
import { buildCountQuery, buildQuery, querySchema } from "../_lib/query.js";

/**
 * Generic, RLS-enforced query endpoint. The frontend shim (src/lib/api/pg.ts)
 * sends a description of the operation; everything runs inside a transaction
 * that impersonates the signed-in user, so the migrated policies apply.
 */
export default endpoint({ method: "POST", schema: querySchema }, async ({ sql, input }) => {
  let count: number | null = null;
  if (input.count && input.action === "select") {
    const c = buildCountQuery(input);
    const res = await sql.query(c.text, c.params);
    count = Number(res.rows[0]?.count ?? 0);
    if (input.head) return { rows: [], count };
  }

  const { text, params } = buildQuery(input);
  const { rows } = await sql.query(text, params);

  if (input.single === "one") {
    if (rows.length !== 1) throw new Error(`expected exactly one row, got ${rows.length}`);
    return count === null ? rows[0] : { rows: rows[0], count };
  }
  if (input.single === "maybe") {
    if (rows.length > 1) throw new Error(`expected at most one row, got ${rows.length}`);
    return count === null ? (rows[0] ?? null) : { rows: rows[0] ?? null, count };
  }
  return count === null ? rows : { rows, count };
});
