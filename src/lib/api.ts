/**
 * Typed client for the Neon-backed API (Vercel Functions).
 *
 * During the feature-by-feature migration this lives next to the existing
 * backend client: a feature switches over only once its endpoints are live.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

let tokenProvider: () => Promise<string | null> = async () => null;

/** Registered once at app start so requests can attach the current session token. */
export function setApiTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
};

export async function apiRequest<T>(
  path: string,
  { method = "GET", query, body }: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}/api/${path.replace(/^\//, "")}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const token = await tokenProvider();
  const response = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: { data?: T; error?: string; message?: string; details?: Record<string, string[]> } = {};
  try {
    payload = await response.json();
  } catch {
    /* empty body */
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error ?? "server_error",
      payload.message ?? payload.error ?? "Er ging iets mis. Probeer het opnieuw.",
      payload.details,
    );
  }

  return payload.data as T;
}

export type WeightLog = {
  id: string;
  client_id: string;
  logged_on: string;
  weight_kg: number;
  note: string | null;
};

export const weightApi = {
  list: (params: { clientId?: string; from?: string; to?: string; limit?: number } = {}) =>
    apiRequest<WeightLog[]>("weight/list", { query: params }),
  log: (body: { loggedOn: string; weightKg: number; note?: string | null }) =>
    apiRequest<WeightLog>("weight/log", { method: "POST", body }),
};

export const checkinsApi = {
  list: (params: { clientId?: string; limit?: number } = {}) =>
    apiRequest<Record<string, unknown>[]>("checkins/list", { query: params }),
  submit: (body: {
    weekStart: string;
    weightKg: number;
    details?: Record<string, unknown>;
    fields?: Record<string, unknown>;
  }) => apiRequest<Record<string, unknown>>("checkins/submit", { method: "POST", body }),
};
