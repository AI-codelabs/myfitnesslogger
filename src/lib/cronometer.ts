import { supabase } from "@/integrations/supabase/client";

/** Connect Cronometer and persist session server-side for this client. */
export async function connectCronometerServer(
  username: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("cronometer", {
    body: { action: "connect_and_save", username, password },
  });
  if (error) return { success: false, error: error.message };
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
    // functions.invoke surfaces non-2xx as an error; check the body if available
    const body = (error as any).context?.body;
    if (body) {
      try {
        const parsed = typeof body === "string" ? JSON.parse(body) : body;
        if (parsed?.error === "session_expired") {
          return { success: false, sessionExpired: true, error: parsed.message };
        }
        if (parsed?.error === "no_session") {
          return { success: false, error: "no_session" };
        }
        return { success: false, error: parsed?.message || parsed?.error || error.message };
      } catch {
        // ignore parse errors
      }
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
