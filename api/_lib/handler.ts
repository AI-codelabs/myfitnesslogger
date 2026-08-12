import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { HttpError, requireUser, type AuthUser } from "./auth.js";
import { withUser } from "./rls.js";
import type { SqlClient } from "./db.js";

type Ctx<TInput> = {
  user: AuthUser;
  sql: SqlClient;
  input: TInput;
  req: VercelRequest;
};

type Options<TSchema extends z.ZodTypeAny> = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  schema?: TSchema;
};

/**
 * Wraps a feature endpoint: method check, JWT verification, input validation
 * and an RLS-scoped transaction. Handlers just return JSON-serialisable data.
 */
export function endpoint<TSchema extends z.ZodTypeAny = z.ZodTypeAny>(
  options: Options<TSchema>,
  handler: (ctx: Ctx<z.infer<TSchema>>) => Promise<unknown>,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const method = options.method ?? "POST";
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== method) {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    try {
      const user = await requireUser(req);

      let input: unknown = method === "GET" ? req.query : req.body;
      if (options.schema) {
        const parsed = options.schema.safeParse(input ?? {});
        if (!parsed.success) {
          return res.status(400).json({
            error: "invalid_input",
            details: parsed.error.flatten().fieldErrors,
          });
        }
        input = parsed.data;
      }

      const data = await withUser(user, (sql) =>
        handler({ user, sql, input: input as z.infer<TSchema>, req }),
      );
      return res.status(200).json({ data });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[api] handler failed", message);
      return res.status(500).json({ error: "server_error", message });
    }
  };
}
