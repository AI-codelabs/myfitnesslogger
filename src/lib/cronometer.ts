import { supabase } from "@/integrations/supabase/client";

type CronometerFunctionError = {
  error?: string;
  message?: string;
};

export type CronometerConnectResult = {
  success: boolean;
  error?: string;
  needsTotp?: boolean;
  goldRequired?: boolean;
};

async function parseCronometerFunctionError(error: unknown): Promise<CronometerFunctionError | null> {
  const context = (error as { context?: unknown } | null)?.context;

  if (context instanceof Response) {
    try {
      const text = await context.text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  const body = (context as { body?: unknown } | null)?.body;
  if (!body) return null;

  try {
    return typeof body === "string" ? JSON.parse(body) : (body as CronometerFunctionError);
  } catch {
    return null;
  }
}

/** Connect Cronometer and persist session server-side for this client. */
export async function connectCronometerServer(
  username: string,
  password: string,
  totpCode?: string,
): Promise<CronometerConnectResult> {
  const { data, error } = await supabase.functions.invoke("cronometer", {
    body: { action: "connect_and_save", username, password, totpCode },
  });
  if (error) {
    const parsed = await parseCronometerFunctionError(error);
    const needsTotp = parsed?.error === "totp_required" || parsed?.error === "totp_incorrect";
    const goldRequired = parsed?.error === "gold_required";
    return { success: false, needsTotp, goldRequired, error: parsed?.message || parsed?.error || error.message };
  }
  if ((data as any)?.error) {
    const needsTotp = (data as any).error === "totp_required" || (data as any).error === "totp_incorrect";
    const goldRequired = (data as any).error === "gold_required";
    return { success: false, needsTotp, goldRequired, error: (data as any).message || (data as any).error };
  }
  return { success: true };
}

export interface SyncResult {
  success: boolean;
  error?: string;
  sessionExpired?: boolean;
  goldRequired?: boolean;
  daysSynced?: number;
  upToDate?: boolean;
  from?: string;
  to?: string;
}

/** Sync nutrition data from last logged day -> today. */
export async function syncCronometer(): Promise<SyncResult> {
  const { data, error } = await supabase.functions.invoke("cronometer", {
    body: { action: "sync" },
  });
  if (error) {
    const parsed = await parseCronometerFunctionError(error);
    if (parsed?.error === "session_expired") {
      return { success: false, sessionExpired: true, error: parsed.message };
    }
    if (parsed?.error === "gold_required") {
      return { success: false, goldRequired: true, error: parsed.message };
    }
    if (parsed?.error === "no_session") {
      return { success: false, error: "no_session" };
    }
    if (parsed) {
      return { success: false, error: parsed.message || parsed.error || error.message };
    }
    return { success: false, error: error.message };
  }
  const d = data as any;
  if (d?.error === "session_expired") return { success: false, sessionExpired: true, error: d.message };
  if (d?.error === "gold_required") return { success: false, goldRequired: true, error: d.message };
  if (d?.error) return { success: false, error: d.message || d.error };
  return {
    success: true,
    daysSynced: d?.days_synced ?? 0,
    upToDate: !!d?.up_to_date,
    from: d?.from,
    to: d?.to,
  };
}

/** Check if this client already has a Cronometer session saved. */
export async function hasCronometerSession(clientId: string): Promise<boolean> {
  const { data } = await supabase
    .from("cronometer_sessions")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  return !!data;
}

/** Disconnect: remove the saved Cronometer session for this client. */
export async function disconnectCronometer(clientId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("cronometer_sessions")
    .delete()
    .eq("client_id", clientId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
