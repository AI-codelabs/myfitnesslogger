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

- `VITE_NEON_AUTH_URL` — `https://ep-super-butterfly-b1u1cypj.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth`
- `VITE_NEON_FEATURES` — see cutover flag below
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` —
  still required only for the Storage signed-URL fallback until that is removed

Backend / serverless functions (`api/`):

- `DATABASE_URL` — Neon pooled connection string (`...-pooler...neon.tech/neondb?sslmode=require`)
- `NEON_AUTH_URL` — same base as `VITE_NEON_AUTH_URL`
- `NEON_AUTH_JWKS_URL` — the above + `/.well-known/jwks.json` (optional, derived from `NEON_AUTH_URL`)
- `NEON_AUTH_ISSUER` — optional issuer check (must match the JWT `iss` claim if set)
- `BLOB_READ_WRITE_TOKEN` — created automatically when a Vercel Blob store is
  attached to the project
- `PUBLIC_APP_URL` / `PUBLIC_API_URL` — see canonical URL above
- `LEGACY_AUTH_URL` — optional; legacy Supabase JWKS for sessions issued before
  the Neon Auth cutover (defaults from `VITE_SUPABASE_URL` if unset)

## After the first deploy
1. Neon Console → Auth → Domains: add `https://myfitnesslogger.vercel.app` (trusted).
2. Neon Console → Auth → Settings: enable **Sign-up with Email** (password reset
   follows automatically). Configure the email provider if reset mail is needed.
3. Attach a Vercel Blob store (Storage → Create → Blob) so
   `BLOB_READ_WRITE_TOKEN` is injected. (Done for `myfitnesslogger-blob`.)
4. Smoke test: `GET /api/health` should return `{ ok: true, db: "ok" }`.
   `GET /api/weight/list` without a token should return 401.
5. Create a **new** coach account via `/signup?as=coach` (existing Supabase
   password hashes cannot transfer — users must re-register or use OAuth).

## Cron jobs (Hobby vs Pro)

Vercel Hobby only allows **daily** crons. `vercel.json` therefore runs
`/api/cron/cronometer-pull` once a day at 05:00 UTC. On Pro, restore hourly with
`"schedule": "0 * * * *"`.

## Feature cutover flag

`VITE_NEON_FEATURES` (frontend, comma separated) decides which features read/write
through the Neon-backed serverless API instead of the legacy backend.

Production build flag (`.env.production` and `VITE_NEON_FEATURES` on Vercel):

`weight,checkins,workouts,nutrition,clients,functions`

Login/signup uses **Neon Auth** (`@neondatabase/neon-js` + `SupabaseAuthAdapter`).
After signup the client calls `POST /api/auth/bootstrap` so `auth.users`,
`profiles`, and `user_roles` match the JWT subject (Neon JWTs have no custom
app-role claims). New uploads go to Vercel Blob. Copied legacy files are read
from Blob; Supabase signed URLs remain a fallback only until Storage is fully
retired.

All table access in the frontend goes through `db.from(...)` (`src/lib/db.ts`).
Function calls go through `invokeFn` → `/api/...`.

The API still accepts legacy Supabase JWTs for any pre-cutover sessions
(`api/_lib/auth.ts` dual issuer).
