import pg from "pg";

let pool: pg.Pool | null = null;

/** Shared Postgres connection pool (serverless-friendly, reused across warm invocations). */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({
      connectionString,
      // Home/dashboard fire many parallel /api/pg/query calls. max:1 forced
      // them to queue behind ensureAuthUser + SELECT on a single connection.
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: { rejectUnauthorized: false },
    });
    pool.on("error", (err) => {
      console.error("[api] pg pool error", err.message);
    });
  }
  return pool;
}

export type SqlClient = {
  query: <T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount: number | null }>;
};
