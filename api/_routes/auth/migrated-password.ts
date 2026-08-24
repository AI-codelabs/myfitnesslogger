import { z } from "zod";
import { HttpError, serviceEndpoint } from "../../_lib/fn.js";
import { hashBetterAuthPassword } from "../../_lib/betterAuthPassword.js";

const lookupSchema = z.object({
  email: z.string().trim().email().max(255),
});

const activateSchema = lookupSchema.extend({
  password: z.string().min(6).max(100),
  confirmPassword: z.string().min(6).max(100),
});

type AppUser = { id: string; email: string; name: string };

async function findAppUser(
  sql: Parameters<Parameters<typeof serviceEndpoint>[1]>[0]["sql"],
  email: string,
): Promise<AppUser | null> {
  const { rows } = await sql.query<AppUser>(
    `SELECT u.id, u.email,
            COALESCE(NULLIF(p.display_name, ''), NULLIF(p.first_name, ''), split_part(u.email, '@', 1)) AS name
       FROM auth.users u
       LEFT JOIN public.profiles p ON p.user_id = u.id
      WHERE lower(u.email) = lower($1)
      ORDER BY
        EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id) DESC,
        EXISTS (SELECT 1 FROM public.invitations i WHERE i.accepted_user_id = u.id) DESC,
        u.created_at DESC
      LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

async function neonEmailExists(
  sql: Parameters<Parameters<typeof serviceEndpoint>[1]>[0]["sql"],
  email: string,
): Promise<boolean> {
  const { rows } = await sql.query<{ ok: boolean }>(
    `SELECT true AS ok FROM neon_auth.user WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  return !!rows[0];
}

/**
 * Public helper for migrated Lovable/Supabase users who have an app row but no
 * Neon Auth password. Lookup + set-password (same UUID as auth.users).
 */
export default serviceEndpoint(
  { auth: "public", methods: ["POST"] },
  async ({ req, sql }) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const wantsActivate = typeof body.password === "string";

    if (!wantsActivate) {
      const parsed = lookupSchema.safeParse(body);
      if (!parsed.success) throw new HttpError(400, "invalid_email");
      const appUser = await findAppUser(sql, parsed.data.email);
      if (!appUser) return { needsPasswordSetup: false };
      const hasNeon = await neonEmailExists(sql, parsed.data.email);
      if (hasNeon) return { needsPasswordSetup: false };
      return {
        needsPasswordSetup: true,
        email: appUser.email,
        name: appUser.name,
      };
    }

    const parsed = activateSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, "invalid_input");
    const { email, password, confirmPassword } = parsed.data;
    if (password !== confirmPassword) throw new HttpError(400, "passwords_do_not_match");

    const appUser = await findAppUser(sql, email);
    if (!appUser) throw new HttpError(404, "account_not_found");
    const existingNeon = await sql.query<{ id: string }>(
      `SELECT id FROM neon_auth.user
        WHERE lower(email) = lower($1) OR id = $2::uuid
        LIMIT 1`,
      [email, appUser.id],
    );
    if (existingNeon.rows[0]) throw new HttpError(409, "already_has_password");

    const hashed = await hashBetterAuthPassword(password);
    const name = appUser.name || appUser.email.split("@")[0] || "User";

    await sql.query("BEGIN");
    try {
      await sql.query(
        `INSERT INTO neon_auth.user (
            id, name, email, "emailVerified", "createdAt", "updatedAt", role, banned
          )
          VALUES ($1::uuid, $2, $3, true, now(), now(), 'user', false)
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            "emailVerified" = true,
            banned = false,
            "updatedAt" = now()`,
        [appUser.id, name, appUser.email.toLowerCase()],
      );

      const existingAccount = await sql.query<{ id: string }>(
        `SELECT id FROM neon_auth.account
          WHERE "userId" = $1 AND "providerId" = 'credential' LIMIT 1`,
        [appUser.id],
      );
      if (existingAccount.rows[0]) {
        await sql.query(
          `UPDATE neon_auth.account SET password = $2, "updatedAt" = now()
            WHERE id = $1`,
          [existingAccount.rows[0].id, hashed],
        );
      } else {
        await sql.query(
          `INSERT INTO neon_auth.account (
              id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
            )
            VALUES (gen_random_uuid(), $1, 'credential', $2::uuid, $3, now(), now())`,
          [appUser.id, appUser.id, hashed],
        );
      }
      await sql.query("COMMIT");
    } catch (err) {
      try {
        await sql.query("ROLLBACK");
      } catch {
        /* connection already gone */
      }
      throw err;
    }

    return { ok: true };
  },
);
