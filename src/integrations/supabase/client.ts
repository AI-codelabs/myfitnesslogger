// Backend selector.
//
// VITE_NEON_FEATURES non-empty  -> Neon serverless API + Neon Managed Better Auth
// VITE_NEON_FEATURES empty      -> legacy Lovable Cloud (Supabase) for auth,
//                                  tables, storage and functions.
//
// The Lovable-hosted build has no /api serverless routes, so it must run in the
// legacy mode below.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { SupabaseAuthAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import type { Database } from "./types";

const NEON_AUTH_UPSTREAM =
  import.meta.env.VITE_NEON_AUTH_URL ??
  "https://ep-super-butterfly-b1u1cypj.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth";

/** True when any feature group is served by the Neon API. */
export const neonEnabled = String(import.meta.env.VITE_NEON_FEATURES ?? "").trim().length > 0;

/**
 * Browser auth must be same-origin. Neon sets a `__Secure-neon-auth.session_token`
 * cookie on the auth host; iPhone Safari drops that third-party cookie, then
 * sign-in succeeds in the DB but `getSession()` throws "Failed to retrieve user session".
 * `/neon-auth` is rewritten to the Neon Auth URL (Vercel + Vite).
 */
const NEON_AUTH_URL =
  typeof window !== "undefined" ? `${window.location.origin}/neon-auth` : NEON_AUTH_UPSTREAM;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Neon Auth with Supabase-shaped methods (signInWithPassword, getSession, …). */
export const neonAuth = neonEnabled
  ? createAuthClient(NEON_AUTH_URL, { adapter: SupabaseAuthAdapter() })
  : (null as unknown as ReturnType<typeof createAuthClient>);

/** Underlying Better Auth client (changePassword, resetPassword, …). */
export function getBetterAuth() {
  return neonAuth.getBetterAuthInstance();
}

const legacy =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          // In legacy mode the Supabase session is the app session.
          persistSession: !neonEnabled,
          autoRefreshToken: !neonEnabled,
          detectSessionInUrl: !neonEnabled,
          storage: !neonEnabled && typeof window !== "undefined" ? window.localStorage : undefined,
        },
      })
    : null;

function requireLegacy() {
  if (!legacy) throw new Error("Legacy Supabase client is not configured");
  return legacy;
}

/**
 * Drop-in surface used across the app. `.auth` is Neon when the Neon features
 * are on, otherwise the legacy Supabase auth client.
 */
export const supabase = {
  auth: (neonEnabled ? neonAuth : requireLegacy().auth) as NonNullable<typeof legacy>["auth"],
  from: ((...args: unknown[]) =>
    (requireLegacy().from as (...a: unknown[]) => unknown)(...args)) as unknown as NonNullable<
    typeof legacy
  >["from"],
  channel: ((...args: unknown[]) =>
    (requireLegacy().channel as (...a: unknown[]) => unknown)(...args)) as unknown as NonNullable<
    typeof legacy
  >["channel"],
  removeChannel: ((...args: unknown[]) =>
    (requireLegacy().removeChannel as (...a: unknown[]) => unknown)(
      ...args,
    )) as unknown as NonNullable<typeof legacy>["removeChannel"],
  storage: new Proxy({} as NonNullable<typeof legacy>["storage"], {
    get(_target, prop, receiver) {
      const client = requireLegacy();
      const value = Reflect.get(client.storage, prop, receiver);
      return typeof value === "function" ? value.bind(client.storage) : value;
    },
  }),
  functions: new Proxy({} as NonNullable<typeof legacy>["functions"], {
    get(_target, prop, receiver) {
      const client = requireLegacy();
      const value = Reflect.get(client.functions, prop, receiver);
      return typeof value === "function" ? value.bind(client.functions) : value;
    },
  }),
};
