import { supabase } from "@/integrations/supabase/client";

export type AppRole = "user" | "coach";

/**
 * Neon JWTs do not carry app roles (custom claims unsupported). After signup,
 * call this once so auth.users / profiles / user_roles match the intended role.
 */
export async function bootstrapProfile(input: {
  displayName: string;
  role: AppRole;
  inviteToken?: string | null;
}): Promise<{ error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { error: "Not signed in" };

  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      display_name: input.displayName,
      role: input.role,
      invite_token: input.inviteToken || undefined,
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      error:
        (body && typeof body === "object" && "error" in body && String(body.error)) ||
        `Bootstrap failed (${res.status})`,
    };
  }
  return { error: null };
}
