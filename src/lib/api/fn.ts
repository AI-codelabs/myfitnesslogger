// Router for the backend functions that were ported from the legacy edge
// runtime to Vercel serverless endpoints under /api.
//
// `invokeFn(name, { body })` keeps the exact `{ data, error }` shape the app
// already expects, so call sites don't change. When the "functions" feature is
// listed in VITE_NEON_FEATURES the call goes to the ported endpoint; otherwise
// it falls back to the legacy edge function.

import { supabase } from "@/integrations/supabase/client";

/** Legacy edge function name -> ported endpoint path. */
export const FUNCTION_ROUTES: Record<string, string> = {
  cronometer: "/api/cronometer",
  "nutrition-ingest": "/api/nutrition/ingest",
  "check-expirations": "/api/cron/check-expirations",
  "delete-client": "/api/clients/delete",
  "gmail-oauth-start": "/api/gmail/oauth-start",
  "gmail-oauth-callback": "/api/gmail/oauth-callback",
  "send-invite-email": "/api/email/send-invite",
  "send-test-checkin-email": "/api/email/send-test-checkin",
  "send-checkin-reminders": "/api/email/send-checkin-reminders",
  "generate-coach-message": "/api/ai/generate-coach-message",
  "generate-weekly-review": "/api/ai/generate-weekly-review",
};

const enabledFeatures = new Set(
  (import.meta.env.VITE_NEON_FEATURES ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean),
);

export const useNeonFunctions = () => enabledFeatures.has("functions");

export type InvokeResult<T> = { data: T | null; error: { message: string } | null };

export async function invokeFn<T = unknown>(
  name: string,
  options?: { body?: unknown; headers?: Record<string, string> },
): Promise<InvokeResult<T>> {
  const path = FUNCTION_ROUTES[name];
  if (!useNeonFunctions() || !path) {
    const res = await supabase.functions.invoke(name, {
      body: options?.body,
      headers: options?.headers,
    });
    return { data: (res.data ?? null) as T | null, error: res.error ?? null };
  }

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;

  try {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers ?? {}),
      },
      body: JSON.stringify(options?.body ?? {}),
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { message: text };
      }
    }

    if (!res.ok) {
      const payload = parsed as { message?: string; error?: string } | null;
      return {
        data: parsed as T | null,
        error: {
          message:
            payload?.message ||
            payload?.error ||
            `Edge function returned ${res.status}`,
        },
      };
    }

    return { data: parsed as T, error: null };
  } catch (e) {
    return {
      message: undefined,
      data: null,
      error: { message: e instanceof Error ? e.message : "Network error" },
    } as InvokeResult<T>;
  }
}
