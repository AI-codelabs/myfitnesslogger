// Migration diagnostics: row counts + freshness per table in the Neon database.
// Guarded by a shared secret so it can be called during cutover without a user
// session. Returns metadata only — never row contents.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withService } from "../_lib/rls.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret || req.headers["x-admin-secret"] !== secret) {
    return res.status(403).json({ error: "forbidden" });
  }

  try {
    const report = await withService(async (sql) => {
      const tables = await sql.query<{ table_schema: string; table_name: string }>(
        `SELECT table_schema, table_name
           FROM information_schema.tables
          WHERE table_schema IN ('public', 'auth')
            AND table_type = 'BASE TABLE'
          ORDER BY table_schema, table_name`,
      );

      const rows: Array<{
        schema: string;
        table: string;
        count: number;
        latest: string | null;
      }> = [];

      for (const t of tables.rows) {
        const hasCreatedAt = await sql.query<{ ok: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = $2 AND column_name = 'created_at'
           ) AS ok`,
          [t.table_schema, t.table_name],
        );
        const select = hasCreatedAt.rows[0]?.ok
          ? `SELECT count(*)::int AS count, max(created_at)::text AS latest`
          : `SELECT count(*)::int AS count, NULL::text AS latest`;
        const r = await sql.query<{ count: number; latest: string | null }>(
          `${select} FROM "${t.table_schema}"."${t.table_name}"`,
        );
        rows.push({
          schema: t.table_schema,
          table: t.table_name,
          count: r.rows[0]?.count ?? 0,
          latest: r.rows[0]?.latest ?? null,
        });
      }

      return rows;
    });

    return res.status(200).json({ ok: true, tables: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return res.status(500).json({ error: "server_error", message });
  }
}
