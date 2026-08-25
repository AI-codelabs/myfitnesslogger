import { getPool, type SqlClient } from "./db.js";
import type { AuthUser } from "./auth.js";

/** Per warm isolate: skip upserts after the first successful ensure for a user. */
const ensuredAuthUsers = new Set<string>();

/**
 * Neon Auth stores identity in `neon_auth.*`. App FKs still reference
 * `auth.users`, so we upsert the JWT subject before RLS impersonation.
 * App roles (coach/user) are set by `/api/auth/bootstrap` after signup —
 * Neon JWTs cannot carry custom role claims.
 */
async function ensureAuthUser(client: SqlClient, user: AuthUser): Promise<void> {
  if (ensuredAuthUsers.has(user.id)) return;

  const meta = user.userMetadata ?? {};
  const displayName =
    (typeof meta.display_name === "string" && meta.display_name.trim()) ||
    (typeof meta.displayName === "string" && meta.displayName.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    user.email;
  const role = meta.role === "coach" ? "coach" : "user";

  await client.query(
    `INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at,
        raw_user_meta_data, raw_app_meta_data, created_at, updated_at
      )
      VALUES ($1, $2, '', now(), $3::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, auth.users.email),
        updated_at = now()`,
    [user.id, user.email, JSON.stringify(meta)],
  );

  await client.query(
    `INSERT INTO public.profiles (user_id, display_name)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id, displayName],
  );

  const existingRole = await client.query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 LIMIT 1`,
    [user.id],
  );
  if (!existingRole.rowCount) {
    await client.query(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1, $2::public.app_role)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [user.id, role],
    );
  }

  ensuredAuthUsers.add(user.id);
}

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
    await ensureAuthUser(client as unknown as SqlClient, user);
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
