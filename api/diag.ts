export default async function handler(req: any, res: any) {
  const out: Record<string, string> = {};
  const mods: [string, () => Promise<unknown>][] = [
    ["zod", () => import("zod")],
    ["jose", () => import("jose")],
    ["pg", () => import("pg")],
    ["auth", () => import("./_lib/auth")],
    ["db", () => import("./_lib/db")],
    ["rls", () => import("./_lib/rls")],
    ["handler", () => import("./_lib/handler")],
  ];
  for (const [name, load] of mods) {
    try {
      await load();
      out[name] = "ok";
    } catch (e: any) {
      out[name] = String(e?.message ?? e);
    }
  }
  res.status(200).json(out);
}
