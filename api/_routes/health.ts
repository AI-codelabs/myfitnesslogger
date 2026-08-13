import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_lib/db.js";

/** Liveness + a real DB ping so a bad DATABASE_URL cannot hide behind hasDb. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const hasDb = !!process.env.DATABASE_URL;
  if (!hasDb) {
    return res.status(503).json({ ok: false, node: process.version, hasDb, db: "unset" });
  }
  try {
    await getPool().query("SELECT 1");
    return res.status(200).json({ ok: true, node: process.version, hasDb, db: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "db_error";
    return res.status(503).json({ ok: false, node: process.version, hasDb, db: "error", message });
  }
}
