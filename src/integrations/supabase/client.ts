// Auth is Neon Managed Better Auth (Supabase-compatible adapter).
// Legacy Supabase client remains only for Storage signed-URL fallback and
// any tables not yet listed in VITE_NEON_FEATURES.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { SupabaseAuthAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import type { Database } from "./types";

const NEON_AUTH_UPSTREAM =
  import.meta.env.VITE_NEON_AUTH_URL ??
  "https://ep-super-butterfly-b1u1cypj.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth";

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
export const neonAuth = createAuthClient(NEON_AUTH_URL, {
  adapter: SupabaseAuthAdapter(),
});

/** Underlying Better Auth client (changePassword, resetPassword, …). */
export function getBetterAuth() {
  return neonAuth.getBetterAuthInstance();
}

const legacy =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          // Auth sessions live on Neon; do not persist a second Supabase session.
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

/**
 * Drop-in surface used across the app. `.auth` is Neon; `.from` / `.storage` /
 * `.functions` stay on the legacy client while those cutovers finish.
 */
export const supabase = {
  auth: neonAuth,
  from: ((...args: unknown[]) => {
    if (!legacy) throw new Error("Legacy Supabase client is not configured");
    return (legacy.from as (...a: unknown[]) => unknown)(...args);
  }) as unknown as NonNullable<typeof legacy>["from"],
  channel: ((...args: unknown[]) => {
    if (!legacy) throw new Error("Legacy Supabase client is not configured");
    return (legacy.channel as (...a: unknown[]) => unknown)(...args);
  }) as unknown as NonNullable<typeof legacy>["channel"],
  removeChannel: ((...args: unknown[]) => {
    if (!legacy) throw new Error("Legacy Supabase client is not configured");
    return (legacy.removeChannel as (...a: unknown[]) => unknown)(...args);
  }) as unknown as NonNullable<typeof legacy>["removeChannel"],

  storage: new Proxy({} as NonNullable<typeof legacy>["storage"], {
    get(_target, prop, receiver) {
      if (!legacy) throw new Error("Legacy Supabase client is not configured");
      const value = Reflect.get(legacy.storage, prop, receiver);
      return typeof value === "function" ? value.bind(legacy.storage) : value;
    },
  }),
  functions: new Proxy({} as NonNullable<typeof legacy>["functions"], {
    get(_target, prop, receiver) {
      if (!legacy) throw new Error("Legacy Supabase client is not configured");
      const value = Reflect.get(legacy.functions, prop, receiver);
      return typeof value === "function" ? value.bind(legacy.functions) : value;
    },
  }),
};
