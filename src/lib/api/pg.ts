// Drop-in query builder that speaks the subset of the supabase-js API this app
// uses, but executes against the Neon-backed serverless endpoint (/api/pg/query)
// with the same row-level security rules.

import { supabase } from "@/integrations/supabase/client";

type Filter = { op: string; column: string; value: unknown };
type Order = { column: string; ascending: boolean };
export type Result<T> = { data: T; error: { message: string } | null; count?: number | null };

type Action = "select" | "insert" | "upsert" | "update" | "delete";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

class PgQuery<T = unknown> implements PromiseLike<Result<T>> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private columns = "*";
  private limitValue?: number;
  private offsetValue?: number;
  private singleMode?: "one" | "maybe";
  private returning = false;
  private values?: unknown;
  private onConflict?: string;
  private ignoreDuplicates?: boolean;
  private countMode = false;
  private headMode = false;

  constructor(
    private table: string,
    private action: Action = "select",
  ) {}

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    this.columns = columns;
    this.returning = true;
    if (options?.count) this.countMode = true;
    if (options?.head) this.headMode = true;
    return this;
  }
  insert(values: unknown) {
    this.action = "insert";
    this.values = values;
    return this;
  }
  upsert(values: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.action = "upsert";
    this.values = values;
    this.onConflict = options?.onConflict;
    this.ignoreDuplicates = options?.ignoreDuplicates;
    return this;
  }
  update(values: unknown) {
    this.action = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) { return this.filter("eq", column, value); }
  neq(column: string, value: unknown) { return this.filter("neq", column, value); }
  gt(column: string, value: unknown) { return this.filter("gt", column, value); }
  gte(column: string, value: unknown) { return this.filter("gte", column, value); }
  lt(column: string, value: unknown) { return this.filter("lt", column, value); }
  lte(column: string, value: unknown) { return this.filter("lte", column, value); }
  like(column: string, value: unknown) { return this.filter("like", column, value); }
  ilike(column: string, value: unknown) { return this.filter("ilike", column, value); }
  in(column: string, value: unknown[]) { return this.filter("in", column, value); }
  is(column: string, value: unknown) { return this.filter("is", column, value); }
  contains(column: string, value: unknown) { return this.filter("contains", column, value); }
  not(column: string, op: string, value: unknown) {
    if (op !== "is") throw new Error(`unsupported negated filter: ${op}`);
    return this.filter("not_is", column, value);
  }

  private filter(op: string, column: string, value: unknown) {
    this.filters.push({ op, column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }
  limit(value: number) {
    this.limitValue = value;
    return this;
  }
  range(from: number, to: number) {
    this.offsetValue = from;
    this.limitValue = to - from + 1;
    return this;
  }
  single() {
    this.singleMode = "one";
    if (this.action === "select") this.returning = true;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    if (this.action === "select") this.returning = true;
    return this;
  }

  private async run(): Promise<Result<T>> {
    const body = {
      table: this.table,
      action: this.action,
      columns: this.columns,
      filters: this.filters,
      order: this.orders,
      limit: this.limitValue,
      offset: this.offsetValue,
      values: this.values,
      onConflict: this.onConflict,
      ignoreDuplicates: this.ignoreDuplicates,
      single: this.singleMode,
      count: this.countMode || undefined,
      head: this.headMode || undefined,
      returning: this.action === "select" ? true : this.returning,
    };

    try {
      const res = await fetch("/api/pg/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          data: null as T,
          error: { message: payload.message ?? payload.error ?? `Request failed (${res.status})` },
        };
      }
      const result = payload.data ?? null;
      if (this.countMode && result && typeof result === "object" && "count" in result) {
        const wrapped = result as { rows: unknown; count: number };
        return { data: (wrapped.rows ?? null) as T, error: null, count: wrapped.count };
      }
      return { data: result as T, error: null, count: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "network_error";
      return { data: null as T, error: { message } };
    }
  }

  then<TResult1 = Result<T>, TResult2 = never>(
    onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export function pgFrom<T = unknown>(table: string) {
  return new PgQuery<T>(table);
}

/** Calls an allow-listed database function through the RLS-scoped endpoint. */
export async function pgRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  try {
    const res = await fetch("/api/pg/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ fn, args }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        data: null as T,
        error: { message: payload.message ?? payload.error ?? `Request failed (${res.status})` },
      };
    }
    return { data: (payload.data ?? null) as T, error: null };
  } catch (err) {
    return { data: null as T, error: { message: err instanceof Error ? err.message : "network_error" } };
  }
}
