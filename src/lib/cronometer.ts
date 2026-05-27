import { supabase } from "@/integrations/supabase/client";

type CronometerFunctionError = {
  error?: string;
  message?: string;
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
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("cronometer", {
    body: { action: "connect_and_save", username, password },
  });
  if (error) {
    const parsed = await parseCronometerFunctionError(error);
    return { success: false, error: parsed?.message || parsed?.error || error.message };
  }
  if ((data as any)?.error) return { success: false, error: (data as any).error };
  return { success: true };
}

export interface SyncResult {
  success: boolean;
  error?: string;
  sessionExpired?: boolean;
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
