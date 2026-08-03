/**
 * Turns a Supabase/PostgREST error into a message a client can act on,
 * and always keeps the technical code visible so we can debug reports
 * like "er is een error met het versturen".
 */
export function describeWriteError(error: unknown, lang: "nl" | "en" = "nl"): string {
  const e = (error ?? {}) as {
    message?: string;
    code?: string;
    details?: string;
    status?: number;
    name?: string;
  };
  const raw = e.message || String(error);
  const code = e.code || (e.status ? `HTTP ${e.status}` : "");
  const lower = raw.toLowerCase();

  const nl = lang === "nl";

  if (
    lower.includes("jwt") ||
    lower.includes("refresh token") ||
    lower.includes("not authenticated") ||
    e.status === 401
  ) {
    return nl
      ? "Je sessie is verlopen. Log opnieuw in en probeer het nog een keer."
      : "Your session expired. Please log in again and retry.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    e.name === "TypeError"
  ) {
    return nl
      ? "Geen verbinding met de server. Controleer je internet en probeer opnieuw."
      : "No connection to the server. Check your internet and try again.";
  }

  if (lower.includes("row-level security") || e.code === "42501") {
    return nl
      ? "Je hebt geen toestemming om dit op te slaan. Log opnieuw in of neem contact op met je coach."
      : "You don't have permission to save this. Log in again or contact your coach.";
  }

  if (lower.includes("timeout") || e.code === "57014" || e.status === 504) {
    return nl
      ? "De server reageerde te traag. Probeer het over een minuut nog eens — je gegevens staan nog in het formulier."
      : "The server timed out. Try again in a minute — your answers are still in the form.";
  }

  if (e.code === "22003" || lower.includes("numeric field overflow")) {
    return nl
      ? "Die waarde is te groot om op te slaan. Controleer je gewicht (bijv. 78,4) en probeer opnieuw."
      : "That value is too large to store. Check your weight (e.g. 78.4) and try again.";
  }

  if (e.code === "22P02" || lower.includes("invalid input syntax")) {
    return nl
      ? "Een van de ingevulde getallen is ongeldig. Gebruik alleen cijfers met een komma of punt."
      : "One of the numbers you entered is invalid. Use digits with a comma or dot only.";
  }

  return nl
    ? `Opslaan mislukt${code ? ` (${code})` : ""}: ${raw}`
    : `Saving failed${code ? ` (${code})` : ""}: ${raw}`;
}
