// Password-recovery guard.
//
// When a user opens a reset-password email link, Supabase establishes a real
// session. Without a guard the app would simply log the user in — which is
// exactly the flaw we prevent here: while a recovery flow is active the user
// is locked to /reset-password until a new password is actually set.

const FLAG = "pw_recovery_active";

/** Detects Supabase recovery params in the current URL (hash or query). */
export const urlHasRecovery = (): boolean => {
  if (typeof window === "undefined") return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const type = hash.get("type") ?? query.get("type");
  if (type === "recovery") return true;
  // PKCE style links: ?code=...  landing on the reset route
  if (query.get("code") && window.location.pathname.includes("reset-password")) return true;
  return false;
};

export const markRecoveryActive = () => {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    /* ignore */
  }
};

export const clearRecovery = () => {
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
};

export const isRecoveryActive = (): boolean => {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
};

// Run detection as early as module-load so the flag exists before any route
// (including the auto-redirecting protected routes) renders.
if (urlHasRecovery()) markRecoveryActive();
