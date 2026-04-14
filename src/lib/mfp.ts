export async function loginToMfp(email: string, password: string) {
  const res = await fetch("/api/mfp/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function refreshMfpToken(refreshToken: string) {
  const res = await fetch("/api/mfp/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return res.json();
}

export async function fetchFoodLog(accessToken: string, domainUserId: string, date: string) {
  const res = await fetch("/api/mfp/diary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, domain_user_id: domainUserId, date }),
  });
  return res.json();
}

// Session stored in localStorage
const SESSION_KEY = "mfp_session";

export interface MfpSession {
  access_token: string;
  refresh_token: string;
  domain_user_id: string;
  display_name: string;
  email: string;
  expires_at: number; // timestamp
}

export function saveSession(session: MfpSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): MfpSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
