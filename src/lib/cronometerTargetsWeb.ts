import { supabase } from "@/integrations/supabase/client";

export interface CronoWebStatus {
  connected: boolean;
  status?: "active" | "needs_reauth" | "error" | "disabled";
  /** "coach" = pushed with the Pro coach session (no client login needed). */
  mode?: "coach" | "client";
  coach_push?: boolean;
  email?: string;
  last_push_at?: string | null;
  last_error?: string | null;
  in_sync?: boolean;
  /** Verified against Cronometer's own /targets endpoint (null = unknown). */
  verified?: boolean | null;
  remote_targets?: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null;
  app_targets?: { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null;
}


async function parseInvokeError(error: unknown): Promise<{ error?: string; needsTotp?: boolean } | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const text = await context.text();
      const parsed = text ? JSON.parse(text) : null;
      if (!parsed) return null;
      return {
        error: parsed.message || parsed.error,
        needsTotp: parsed.needsTotp === true || parsed.error === "totp_required",
      };
    } catch {
      return null;
    }
  }
  const body = (context as { body?: unknown } | null)?.body;
  if (!body) return null;
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    return {
      error: (parsed as any)?.message || (parsed as any)?.error,
      needsTotp: (parsed as any)?.needsTotp === true || (parsed as any)?.error === "totp_required",
    };
  } catch {
    return null;
  }
}

async function invoke<T = any>(body: Record<string, unknown>): Promise<{ data?: T; error?: string; needsTotp?: boolean }> {
  const { data, error } = await invokeFn("cronometer", { body });
  if (error) {
    const parsed = await parseInvokeError(error);
    if (parsed?.error) return parsed;
    return { error: error.message };
  }
  if ((data as any)?.error) {
    return {
      error: (data as any).message || (data as any).error,
      needsTotp: (data as any).needsTotp === true || (data as any).error === "totp_required",
    };
  }
  return { data: data as T };
}

export const getCronometerWebStatus = (client_id?: string) =>
  invoke<CronoWebStatus>({ action: "web_status", ...(client_id ? { client_id } : {}) });

export const connectCronometerWeb = (args: {
  /** Omit for self-connect (client). Coaches pass their client's id. */
  client_id?: string;
  email: string;
  password: string;
  totpCode?: string;
}) => invoke({ action: "web_connect", ...args });

export const disconnectCronometerWeb = (client_id?: string) =>
  invoke({ action: "web_disconnect", ...(client_id ? { client_id } : {}) });

export const pushCronometerTargets = (client_id?: string, force = false) =>
  invoke({ action: "web_push_targets", force, ...(client_id ? { client_id } : {}) });

