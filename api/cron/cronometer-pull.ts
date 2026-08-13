// Scheduled Cronometer pull. Vercel Cron issues a GET, while the Cronometer
// endpoint is an action-router that expects a POST body, so this thin route
// adapts the request and delegates.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import cronometer from "../cronometer/index.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const proxied = Object.assign(Object.create(Object.getPrototypeOf(req)), req, {
    method: "POST",
    body: { action: "sync_all" },
  }) as VercelRequest;
  return cronometer(proxied, res);
}
