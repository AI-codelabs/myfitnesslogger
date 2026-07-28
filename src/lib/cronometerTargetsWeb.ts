import { supabase } from "@/integrations/supabase/client";

export interface CronoWebStatus {
  connected: boolean;
  status?: "active" | "needs_reauth" | "error" | "disabled";
  email?: string;
  last_push_at?: string | null;
  last_error?: string | null;
  in_sync?: boolean;
}

async function invoke<T = any>(body: Record<string, unknown>): Promise<{ data?: T; error?: string; needsTotp?: boolean }> {
  const { data, error } = await supabase.functions.invoke("cronometer", { body });
  if (error) {
    const ctx: any = (error as any).context;
    try {
      const parsed = typeof ctx?.body === "string" ? JSON.parse(ctx.body) : ctx?.body;
      return {
        error: parsed?.message || parsed?.error || error.message,
        needsTotp: parsed?.needsTotp === true || parsed?.error === "totp_required",
      };
    } catch {
      return { error: error.message };
    }
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

