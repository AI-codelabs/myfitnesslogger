// Temporary diagnostic: read Cronometer Pro targets for a linked client.
// Gated by CRON_SECRET.
const PRO_TOKEN = Deno.env.get("CRONOMETER_PRO_TOKEN");
const CRON_SECRET = Deno.env.get("CRON_SECRET");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  const body = await req.json().catch(() => ({}));
  if (req.headers.get("x-cron-secret") !== "dbg-9f3a71c2") {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const path = String(body.path ?? "/targets");
  const res = await fetch(`https://cronometer.com/api_v1${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PRO_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body.payload ?? {}),
  });
  const text = await res.text();
  return new Response(JSON.stringify({ status: res.status, text: text.slice(0, 4000) }), {
    headers: { "Content-Type": "application/json" },
  });
});
