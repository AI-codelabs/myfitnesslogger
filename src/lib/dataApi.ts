// Bridge layer for the feature-by-feature backend cutover.
//
// Features listed in VITE_NEON_FEATURES are served by the serverless API
// (/api/*), which talks to the Neon database with the same RLS rules.
// Everything else keeps using the legacy client until its turn comes.

import { supabase } from "@/integrations/supabase/client";

export type NeonFeature =
  | "weight"
  | "checkins"
  | "workouts"
  | "nutrition"
  | "clients"
  | "functions";

const enabled = new Set(
  (import.meta.env.VITE_NEON_FEATURES ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean),
);

export const usesNeon = (feature: NeonFeature) => enabled.has(feature);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Calls a serverless endpoint and unwraps its { data } envelope. */
export async function apiGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.set(k, String(v));
  const res = await fetch(`/api/${path}${qs.toString() ? `?${qs}` : ""}`, {
    headers: await authHeader(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.message ?? body.error ?? "Request failed");
  return body.data as T;
}

export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.message ?? body.error ?? "Request failed");
  return body.data as T;
}
