// Password-recovery guard.
//
// Neon Auth redirects reset emails to `/reset-password?token=...`. While that
// flow is active we keep the user on the reset page until a new password is set.

const FLAG = "pw_recovery_active";

/** Detects Neon (and legacy) recovery params in the current URL. */
export const urlHasRecovery = (): boolean => {
  if (typeof window === "undefined") return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  if (query.get("token") && window.location.pathname.includes("reset-password")) return true;
  if (query.get("error") && window.location.pathname.includes("reset-password")) return true;
  const type = hash.get("type") ?? query.get("type");
  if (type === "recovery") return true;
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

if (urlHasRecovery()) markRecoveryActive();
