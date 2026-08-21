/** Canonical production app URL. Prefer PUBLIC_APP_URL / PUBLIC_API_URL when set. */
export const CANONICAL_APP_URL = "https://myfitnesslogger.vercel.app";

export const CANONICAL_APP_HOSTS = [
  "myfitnesslogger.vercel.app",
  "myfitnesslogger-ai-codelab.vercel.app",
] as const;

export function appUrlFromEnv(): string {
  return (process.env.PUBLIC_APP_URL ?? CANONICAL_APP_URL).replace(/\/$/, "");
}
