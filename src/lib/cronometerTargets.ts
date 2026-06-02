import { supabase } from "@/integrations/supabase/client";

export interface PushTargetsArgs {
  client_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Push macro targets to the client's Cronometer profile.
 * Silently no-ops if the client hasn't connected or hasn't opted in.
 * Returns { success } and never throws — callers can fire-and-forget.
 */
export async function pushTargetsToCronometer(args: PushTargetsArgs): Promise<{
  success: boolean;
  skipped?: "no_session" | "sync_disabled";
  error?: string;
  recurringWarning?: string;
  recurringCode?: string;
  fallbackDays?: number;
}> {
  if (!args.client_id) return { success: false, error: "missing client_id" };
  const macros = [args.calories, args.protein_g, args.carbs_g, args.fat_g];
  if (macros.some((v) => !Number.isFinite(v) || v <= 0)) {
    return { success: false, error: "missing macro targets" };
  }

  const { data, error } = await supabase.functions.invoke("cronometer", {
    body: { action: "push_targets", ...args },
  });
  if (error) {
    const body = (error as any).context?.body;
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      if (parsed?.error === "no_session") return { success: false, skipped: "no_session" };
      if (parsed?.error === "sync_disabled") return { success: false, skipped: "sync_disabled" };
      return { success: false, error: parsed?.message || parsed?.error || error.message };
    } catch {
      return { success: false, error: error.message };
    }
  }
  if ((data as any)?.error) {
    const e = (data as any).error;
    if (e === "no_session") return { success: false, skipped: "no_session" };
    if (e === "sync_disabled") return { success: false, skipped: "sync_disabled" };
    return { success: false, error: (data as any).message || e };
  }
  return {
    success: true,
    recurringWarning: (data as any)?.recurring_warning,
    recurringCode: (data as any)?.recurring_code,
    fallbackDays: (data as any)?.fallback_days,
  };
}
