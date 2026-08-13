import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";

type CronometerFunctionError = {
  error?: string;
  message?: string;
};

type CronometerFunctionResponse = CronometerFunctionError & {
  success?: boolean;
  days_synced?: number;
  up_to_date?: boolean;
  from?: string;
  to?: string;
};

export type CronometerConnectResult = {
  success: boolean;
  error?: string;
  errorCode?: string;
  needsTotp?: boolean;
  goldRequired?: boolean;
  exportForbidden?: boolean;
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
    const exportForbidden = parsed?.error === "export_forbidden";
    return {
      success: false,
      errorCode: parsed?.error,
      needsTotp,
      goldRequired,
      exportForbidden,
      error: parsed?.message || parsed?.error || error.message,
    };
  }
  const d = data as CronometerFunctionResponse | null;
  if (d?.error) {
    const needsTotp = d.error === "totp_required" || d.error === "totp_incorrect";
    const goldRequired = d.error === "gold_required";
    const exportForbidden = d.error === "export_forbidden";
    return {
      success: false,
      errorCode: d.error,
      needsTotp,
      goldRequired,
      exportForbidden,
      error: d.message || d.error,
    };
  }
  return { success: true };
}

export interface SyncResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  sessionExpired?: boolean;
  goldRequired?: boolean;
  exportForbidden?: boolean;
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
      return { success: false, errorCode: parsed.error, sessionExpired: true, error: parsed.message };
    }
    if (parsed?.error === "gold_required") {
      return { success: false, errorCode: parsed.error, goldRequired: true, error: parsed.message };
    }
    if (parsed?.error === "export_forbidden") {
      return { success: false, errorCode: parsed.error, exportForbidden: true, error: parsed.message };
    }
    if (parsed?.error === "no_session") {
      return { success: false, errorCode: parsed.error, error: "no_session" };
    }
    if (parsed) {
      return { success: false, errorCode: parsed.error, error: parsed.message || parsed.error || error.message };
    }
    return { success: false, error: error.message };
  }
  const d = data as CronometerFunctionResponse | null;
  if (d?.error === "session_expired") {
    return { success: false, errorCode: d.error, sessionExpired: true, error: d.message };
  }
  if (d?.error === "gold_required") {
    return { success: false, errorCode: d.error, goldRequired: true, error: d.message };
  }
  if (d?.error === "export_forbidden") {
    return { success: false, errorCode: d.error, exportForbidden: true, error: d.message };
  }
  if (d?.error) return { success: false, errorCode: d.error, error: d.message || d.error };
  return {
    success: true,
    daysSynced: d?.days_synced ?? 0,
    upToDate: !!d?.up_to_date,
    from: d?.from,
    to: d?.to,
  };
}

/** Check if this client already has a Cronometer link (via Pro API). */
export async function hasCronometerSession(clientId: string): Promise<boolean> {
  const { data } = await db
    .from("cronometer_clients")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "active")
    .maybeSingle();
  return !!data;
}

/** Disconnect: remove the Cronometer client link for this client. */
export async function disconnectCronometer(clientId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await db
    .from("cronometer_clients")
    .delete()
    .eq("client_id", clientId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
