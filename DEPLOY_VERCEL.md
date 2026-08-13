# Vercel import checklist

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

(Still required while the app is being migrated feature-by-feature; the current
UI reads them at startup.)

Backend / serverless functions (`api/`):

- `DATABASE_URL` — Neon pooled connection string (`...-pooler...neon.tech/neondb?sslmode=require`)
- `NEON_AUTH_URL` — `https://ep-super-butterfly-b1u1cypj.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth`
- `NEON_AUTH_JWKS_URL` — the above + `/.well-known/jwks.json` (optional, derived from `NEON_AUTH_URL`)
- `NEON_AUTH_ISSUER` — optional issuer check
- `BLOB_READ_WRITE_TOKEN` — created automatically when a Vercel Blob store is
  attached to the project

## After the first deploy
1. Add `https://<project>.vercel.app` to Neon Auth → Domains (trusted domains).
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

- unset / empty (default): everything stays on the legacy backend
- `weight`: weight logging uses `/api/weight/list|log|delete` against Neon
- `checkins`: weekly check-ins + review drafts
- `workouts`: exercises, plans, days, plan exercises, assignments, schedule
  overrides, sessions, set logs
- `nutrition`: meal plans/selections, nutrition documents/templates/plans,
  Cronometer client + log tables
- `clients`: profiles, invitations, notifications, roles, coach messages,
  onboarding, goals, progress photos

All table access in the frontend now goes through `db.from(...)` (`src/lib/db.ts`),
so enabling a group is a flag change only — no code edits.

**Before flipping a group**: re-copy that group's tables from the legacy
database into Neon (the initial copy is a point-in-time snapshot), and make sure
nothing else still writes those tables. `nutrition` and `clients` are still
written by legacy edge functions and database triggers, so they must wait until
those functions are migrated.

The API accepts both Neon Auth tokens and legacy tokens during the transition
(`api/_lib/auth.ts` dual issuer). Set `LEGACY_AUTH_URL` (or `VITE_SUPABASE_URL`)
on the functions so the legacy JWKS can be fetched.
