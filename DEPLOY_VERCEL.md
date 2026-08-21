# Vercel import checklist

## Canonical production URL

**Only this host is production:** https://myfitnesslogger.vercel.app  
Project name: `myfitnesslogger` (team `ai-codelab`).

Do **not** use https://my-fitness-logger.vercel.app — that is a separate,
unused Vercel project (no `/api`, different bundle). Archive/delete it in the
Vercel dashboard after confirming nothing points at it.

Set on the live project:

- `PUBLIC_APP_URL=https://myfitnesslogger.vercel.app`
- `PUBLIC_API_URL=https://myfitnesslogger.vercel.app`

## Project settings
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- Root directory: `/` (repo root)

`vercel.json` already pins these plus the SPA rewrite and a 60s max duration for
the serverless functions under `api/`.

## Environment variables

Frontend (must exist at **build** time, all environments):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

(Still required while login uses the legacy auth client.)

Backend / serverless functions (`api/`):

- `DATABASE_URL` — Neon pooled connection string (`...-pooler...neon.tech/neondb?sslmode=require`)
- `NEON_AUTH_URL` — `https://ep-super-butterfly-b1u1cypj.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth`
- `NEON_AUTH_JWKS_URL` — the above + `/.well-known/jwks.json` (optional, derived from `NEON_AUTH_URL`)
- `NEON_AUTH_ISSUER` — optional issuer check
- `BLOB_READ_WRITE_TOKEN` — created automatically when a Vercel Blob store is
  attached to the project
- `PUBLIC_APP_URL` / `PUBLIC_API_URL` — see canonical URL above

## After the first deploy
1. Add `https://myfitnesslogger.vercel.app` to Neon Auth → Domains (trusted domains).
2. Attach a Vercel Blob store (Storage → Create → Blob) so
   `BLOB_READ_WRITE_TOKEN` is injected. (Done for `myfitnesslogger-blob`.)
3. Smoke test: `GET /api/health` should return `{ ok: true, db: "ok" }`.
   `GET /api/weight/list` without a token should return 401.

## Cron jobs (Hobby vs Pro)

Vercel Hobby only allows **daily** crons. `vercel.json` therefore runs
`/api/cron/cronometer-pull` once a day at 05:00 UTC. On Pro, restore hourly with
`"schedule": "0 * * * *"`.

## Feature cutover flag

`VITE_NEON_FEATURES` (frontend, comma separated) decides which features read/write
through the Neon-backed serverless API instead of the legacy backend.

Production build flag (`.env.production` and `VITE_NEON_FEATURES` on Vercel):

`weight,checkins,workouts,nutrition,clients,functions`

Login/signup still uses the legacy auth client. New uploads go to Vercel Blob.
Copied legacy files are read from Blob at `{bucket}/{original_path}`; Supabase
signed URLs remain a fallback only until Neon Auth cutover.

All table access in the frontend goes through `db.from(...)` (`src/lib/db.ts`).
Function calls go through `invokeFn` → `/api/...`.

The API accepts both Neon Auth tokens and legacy tokens during the transition
(`api/_lib/auth.ts` dual issuer). Set `LEGACY_AUTH_URL` (or `VITE_SUPABASE_URL`)
on the functions so the legacy JWKS can be fetched.
