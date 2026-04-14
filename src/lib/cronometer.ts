import type { CronometerExportData } from "@/types/cronometer";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cronometer`;

interface CronometerSession {
  cookies: Record<string, string>;
  user_id: string;
  gwt_permutation: string;
  gwt_header: string;
  connected_at: number;
}

const SESSION_KEY = "cronometer_session";

export function saveSession(session: CronometerSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): CronometerSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function callCronometer(body: Record<string, unknown>) {
  const resp = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return resp.json();
}

/** Login and store session cookies for future use */
export async function connectToCronometer(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string; session?: CronometerSession }> {
  const result = await callCronometer({ action: "connect", username, password });
  if (result.error) return { success: false, error: result.error };

  const session: CronometerSession = {
    cookies: result.cookies,
    user_id: result.user_id,
    gwt_permutation: result.gwt_permutation,
    gwt_header: result.gwt_header,
    connected_at: Date.now(),
  };
  saveSession(session);
  return { success: true, session };
}

/** Export data using stored session (no re-login needed) */
export async function exportData(
  session: CronometerSession,
  startDate?: string,
  endDate?: string
): Promise<CronometerExportData> {
  return callCronometer({
    action: "export",
    cookies: session.cookies,
    user_id: session.user_id,
    gwt_permutation: session.gwt_permutation,
    gwt_header: session.gwt_header,
    start: startDate,
    end: endDate,
  });
}
