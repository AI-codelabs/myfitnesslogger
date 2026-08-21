import { z } from "zod";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, requireUser } from "../../_lib/auth.js";
import { withService } from "../../_lib/rls.js";

const schema = z.object({
  display_name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["user", "coach"]),
  invite_token: z.string().trim().min(1).optional(),
});

/**
 * Neon Auth JWTs cannot carry custom app roles. After a Neon signup, the client
 * calls this once to create auth.users / profiles / user_roles for the JWT sub.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const user = await requireUser(req);
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_input",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { role, invite_token } = parsed.data;
    const displayName =
      parsed.data.display_name?.trim() ||
      (typeof user.userMetadata.display_name === "string"
        ? user.userMetadata.display_name
        : null) ||
      (typeof user.userMetadata.displayName === "string"
        ? user.userMetadata.displayName
        : null) ||
      (typeof user.userMetadata.name === "string" ? user.userMetadata.name : null) ||
      user.email ||
      "User";

    if (role === "user" && !invite_token) {
      // Coaches self-serve; end users must come from an invite link.
      // Allow bootstrap without token only when a role already exists (idempotent re-entry).
    }

    await withService(async (sql) => {
      if (role === "user" && invite_token) {
        const invite = await sql.query<{
          id: string;
          email: string;
          status: string;
        }>(
          `SELECT id, email, status FROM public.invitations
           WHERE token = $1 LIMIT 1`,
          [invite_token],
        );
        const row = invite.rows[0];
        if (!row || row.status !== "pending") {
          throw new HttpError(400, "Invalid or used invitation");
        }
        if (
          user.email &&
          row.email.toLowerCase() !== user.email.toLowerCase()
        ) {
          throw new HttpError(400, "Invitation email does not match signed-in user");
        }
      } else if (role === "user") {
        const existingRole = await sql.query(
          `SELECT 1 FROM public.user_roles WHERE user_id = $1 LIMIT 1`,
          [user.id],
        );
        if (!existingRole.rowCount) {
          throw new HttpError(400, "Users must be invited by a coach");
        }
      }

      const meta = {
        ...user.userMetadata,
        display_name: displayName,
        role,
      };

      await sql.query(
        `INSERT INTO auth.users (
            id, email, encrypted_password, email_confirmed_at,
            raw_user_meta_data, raw_app_meta_data, created_at, updated_at
          )
          VALUES ($1, $2, '', now(), $3::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now())
          ON CONFLICT (id) DO UPDATE SET
            email = COALESCE(EXCLUDED.email, auth.users.email),
            raw_user_meta_data = auth.users.raw_user_meta_data || EXCLUDED.raw_user_meta_data,
            updated_at = now()`,
        [user.id, user.email, JSON.stringify(meta)],
      );

      await sql.query(
        `INSERT INTO public.profiles (user_id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name)`,
        [user.id, displayName],
      );

      const roles = await sql.query<{ role: string }>(
        `SELECT role::text AS role FROM public.user_roles WHERE user_id = $1`,
        [user.id],
      );

      if (!roles.rowCount) {
        await sql.query(
          `INSERT INTO public.user_roles (user_id, role)
           VALUES ($1, $2::public.app_role)`,
          [user.id, role],
        );
      } else if (
        role === "coach" &&
        roles.rows.every((r) => r.role === "user")
      ) {
        // Brand-new Neon signup may have been defaulted to "user" by ensureAuthUser
        // before bootstrap ran; allow a one-time promote to coach.
        const created = await sql.query<{ age_seconds: number }>(
          `SELECT EXTRACT(EPOCH FROM (now() - created_at))::int AS age_seconds
           FROM auth.users WHERE id = $1`,
          [user.id],
        );
        const age = created.rows[0]?.age_seconds ?? 9999;
        if (age <= 600) {
          await sql.query(`DELETE FROM public.user_roles WHERE user_id = $1`, [
            user.id,
          ]);
          await sql.query(
            `INSERT INTO public.user_roles (user_id, role)
             VALUES ($1, 'coach'::public.app_role)`,
            [user.id],
          );
        }
      }
    });

    return res.status(200).json({ data: { ok: true } });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/auth/bootstrap] failed", message);
    return res.status(500).json({ error: "server_error", message });
  }
}
