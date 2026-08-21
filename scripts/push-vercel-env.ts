import { execSync } from "child_process";

const projectId = "prj_xO3I4LOeR8RdirgtVU2s2MbklKpq";
const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error("VERCEL_TOKEN is not set");

const envVars = [
  "ANTHROPIC_API_KEY",
  "CRONOMETER_PRO_TOKEN",
  "CRONO_COACH_EMAIL",
  "CRONO_COACH_PASSWORD",
  "CRONO_WEB_KEY",
  "CRON_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "PUBLIC_APP_URL",
  "PUBLIC_API_URL",
  "DATABASE_URL",
  "ADMIN_API_SECRET",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_NEON_AUTH_URL",
  "VITE_NEON_FEATURES",
  "NEON_AUTH_URL",
  "NEON_AUTH_JWKS_URL",
  "NEON_AUTH_ISSUER",
  "LEGACY_AUTH_URL",
];

const missing = envVars.filter((k) => !process.env[k]);
if (missing.length) {
  console.warn("Missing values (will be skipped):", missing.join(", "));
}

const target = ["production", "preview", "development"];

async function vercel(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Vercel API ${method} ${path} -> ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  // List existing env vars
  const existing: Array<{ id: string; key: string }> = (
    await vercel("GET", `/v10/projects/${projectId}/env?decrypt=false`)
  ).envs;

  // Delete existing ones we are about to set
  for (const key of envVars) {
    const item = existing.find((e) => e.key === key);
    if (item) {
      await vercel("DELETE", `/v10/projects/${projectId}/env/${item.id}`);
      console.log(`Deleted existing ${key}`);
    }
  }

  // Create new env vars
  for (const key of envVars) {
    const value = process.env[key];
    if (!value) {
      console.log(`Skipping ${key} (missing)`);
      continue;
    }
    const isSecret =
      key.includes("TOKEN") ||
      key.includes("KEY") ||
      key.includes("SECRET") ||
      key.includes("PASSWORD") ||
      key === "DATABASE_URL" ||
      key === "CRONO_COACH_EMAIL" ||
      key === "CRONO_COACH_PASSWORD" ||
      key === "CRONOMETER_PRO_TOKEN";

    await vercel("POST", `/v10/projects/${projectId}/env`, {
      key,
      value,
      type: isSecret ? "encrypted" : "plain",
      target,
    });
    console.log(`Set ${key} (${isSecret ? "encrypted" : "plain"})`);
  }

  // Fetch project to get deployment URL
  const project = await vercel("GET", `/v9/projects/${projectId}`);
  const domains = project.targets?.production?.alias || project.alias || [];
  console.log("\nProject domains:", domains);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
