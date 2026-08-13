import { z } from "zod";

/** Tables the generic query endpoint may touch. RLS still decides per-row access. */
export const ALLOWED_TABLES = new Set([
  "client_goals",
  "client_meal_plans",
  "client_meal_selections",
  "client_nutrition_documents",
  "client_workout_assignments",
  "coach_messages",
  "cronometer_clients",
  "cronometer_nutrition_logs",
  "email_templates",
  "exercises",
  "invitations",
  "notifications",
  "nutrition_plan_templates",
  "nutrition_plans",
  "onboarding_responses",
  "profiles",
  "progress_photos",
  "user_roles",
  "weekly_checkins",
  "weekly_review_drafts",
  "weight_logs",
  "workout_plan_days",
  "workout_plan_exercises",
  "workout_plans",
  "workout_schedule_overrides",
  "workout_sessions",
  "workout_set_logs",
]);

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`invalid identifier: ${name}`);
  return name;
}

const filterSchema = z.object({
  op: z.enum([
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "in",
    "is",
    "not_is",
    "contains",
  ]),
  column: z.string(),
  value: z.unknown(),
});

export const querySchema = z.object({
  table: z.string(),
  action: z.enum(["select", "insert", "upsert", "update", "delete"]),
  columns: z.string().default("*"),
  filters: z.array(filterSchema).default([]),
  order: z
    .array(z.object({ column: z.string(), ascending: z.boolean().default(true) }))
    .default([]),
  limit: z.number().int().min(1).max(5000).optional(),
  offset: z.number().int().min(0).optional(),
  values: z.union([z.record(z.unknown()), z.array(z.record(z.unknown()))]).optional(),
  onConflict: z.string().optional(),
  ignoreDuplicates: z.boolean().optional(),
  count: z.boolean().optional(),
  /** count only, no rows */
  head: z.boolean().optional(),
  /** "one" -> exactly one row, "maybe" -> zero or one row */
  single: z.enum(["one", "maybe"]).optional(),
  /** false for writes that don't need the row back */
  returning: z.boolean().default(true),
});

export type QueryInput = z.infer<typeof querySchema>;

function columnList(columns: string): string {
  const trimmed = columns.trim();
  if (trimmed === "*" || trimmed === "") return "*";
  if (trimmed.includes("(")) throw new Error("embedded selects are not supported");
  return trimmed
    .split(",")
    .map((c) => ident(c.trim()))
    .join(", ");
}

type Built = { text: string; params: unknown[] };

function whereClause(filters: QueryInput["filters"], params: unknown[]): string {
  if (!filters.length) return "";
  const parts = filters.map((f) => {
    const col = ident(f.column);
    switch (f.op) {
      case "in": {
        const arr = Array.isArray(f.value) ? f.value : [];
        if (!arr.length) return "false";
        params.push(arr);
        return `${col} = ANY($${params.length})`;
      }
      case "is":
        if (f.value === null) return `${col} IS NULL`;
        params.push(f.value);
        return `${col} IS NOT DISTINCT FROM $${params.length}`;
      case "not_is":
        if (f.value === null) return `${col} IS NOT NULL`;
        params.push(f.value);
        return `${col} IS DISTINCT FROM $${params.length}`;
      case "contains":
        params.push(f.value);
        return `${col} @> $${params.length}`;
      default: {
        const sqlOp = {
          eq: "=",
          neq: "<>",
          gt: ">",
          gte: ">=",
          lt: "<",
          lte: "<=",
          like: "LIKE",
          ilike: "ILIKE",
        }[f.op];
        params.push(f.value);
        return `${col} ${sqlOp} $${params.length}`;
      }
    }
  });
  return ` WHERE ${parts.join(" AND ")}`;
}

/** Translates the request into a single parameterised statement. */
/** Count-only variant of a select, used for `{ count: "exact" }` requests. */
export function buildCountQuery(input: QueryInput): Built {
  const table = ident(input.table);
  if (!ALLOWED_TABLES.has(table)) throw new Error(`table not allowed: ${table}`);
  const params: unknown[] = [];
  const text = `SELECT count(*)::int AS count FROM public.${table}${whereClause(
    input.filters,
    params,
  )}`;
  return { text, params };
}

export function buildQuery(input: QueryInput): Built {
  const table = ident(input.table);
  if (!ALLOWED_TABLES.has(table)) throw new Error(`table not allowed: ${table}`);
  const params: unknown[] = [];
  const cols = columnList(input.columns);

  if (input.action === "select") {
    let text = `SELECT ${cols} FROM public.${table}`;
    text += whereClause(input.filters, params);
    if (input.order.length) {
      text += ` ORDER BY ${input.order
        .map((o) => `${ident(o.column)} ${o.ascending ? "ASC" : "DESC"}`)
        .join(", ")}`;
    }
    if (input.limit !== undefined) {
      params.push(input.limit);
      text += ` LIMIT $${params.length}`;
    }
    if (input.offset !== undefined) {
      params.push(input.offset);
      text += ` OFFSET $${params.length}`;
    }
    return { text, params };
  }

  if (input.action === "delete") {
    const where = whereClause(input.filters, params);
    if (!where) throw new Error("delete requires filters");
    return {
      text: `DELETE FROM public.${table}${where}${input.returning ? ` RETURNING ${cols}` : ""}`,
      params,
    };
  }

  if (input.action === "update") {
    const values = (input.values ?? {}) as Record<string, unknown>;
    const keys = Object.keys(values);
    if (!keys.length) throw new Error("update requires values");
    const sets = keys.map((k) => {
      params.push(values[k]);
      return `${ident(k)} = $${params.length}`;
    });
    const where = whereClause(input.filters, params);
    if (!where) throw new Error("update requires filters");
    return {
      text: `UPDATE public.${table} SET ${sets.join(", ")}${where}${
        input.returning ? ` RETURNING ${cols}` : ""
      }`,
      params,
    };
  }

  // insert / upsert
  const rows = Array.isArray(input.values) ? input.values : [input.values ?? {}];
  if (!rows.length) throw new Error("insert requires values");
  const keys = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach((k) => acc.add(k));
      return acc;
    }, new Set()),
  ).map(ident);
  if (!keys.length) throw new Error("insert requires at least one column");

  const tuples = rows.map((row) => {
    const placeholders = keys.map((k) => {
      params.push((row as Record<string, unknown>)[k] ?? null);
      return `$${params.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  let text = `INSERT INTO public.${table} (${keys.join(", ")}) VALUES ${tuples.join(", ")}`;

  if (input.action === "upsert") {
    const conflict = (input.onConflict ?? "id")
      .split(",")
      .map((c) => ident(c.trim()))
      .join(", ");
    if (input.ignoreDuplicates) {
      text += ` ON CONFLICT (${conflict}) DO NOTHING`;
    } else {
      const updatable = keys.filter((k) => !conflict.split(", ").includes(k));
      text += updatable.length
        ? ` ON CONFLICT (${conflict}) DO UPDATE SET ${updatable
            .map((k) => `${k} = EXCLUDED.${k}`)
            .join(", ")}`
        : ` ON CONFLICT (${conflict}) DO NOTHING`;
    }
  }

  if (input.returning) text += ` RETURNING ${cols}`;
  return { text, params };
}
