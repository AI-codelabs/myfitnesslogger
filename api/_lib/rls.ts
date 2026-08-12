import { getPool, type SqlClient } from "./db.js";
import type { AuthUser } from "./auth.js";

/**
 * Runs `fn` inside a transaction where the Postgres session impersonates the
 * signed-in user, so the RLS policies migrated from the old backend keep
 * enforcing access exactly as before:
 *   - role is switched to `authenticated`
 *   - `request.jwt.claims` carries the user id, which `auth.uid()` reads
 */
export async function withUser<T>(
  user: AuthUser,
  fn: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const claims = JSON.stringify({
      sub: user.id,
      email: user.email,
      role: "authenticated",
    });
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      claims,
    ]);
    await client.query("SELECT set_config('role', 'authenticated', true)");
    const result = await fn(client as unknown as SqlClient);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already gone */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Service-level access that bypasses RLS. Only for cron jobs and admin tasks. */
export async function withService<T>(
  fn: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client as unknown as SqlClient);
  } finally {
    client.release();
  }
}
