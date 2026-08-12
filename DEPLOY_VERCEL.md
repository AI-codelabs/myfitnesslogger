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
   `BLOB_READ_WRITE_TOKEN` is injected.
3. Smoke test: `GET /api/weight/list` with a Neon Auth bearer token should
   return 200, and without a token 401.

## Feature cutover flag

`VITE_NEON_FEATURES` (frontend, comma separated) decides which features read/write
through the Neon-backed serverless API instead of the legacy backend.

- unset / empty (default): everything stays on the legacy backend
- `weight`: weight logging uses `/api/weight/list|log|delete` against Neon

The API accepts both Neon Auth tokens and legacy tokens during the transition
(`api/_lib/auth.ts` dual issuer). Set `LEGACY_AUTH_URL` (or `VITE_SUPABASE_URL`)
on the functions so the legacy JWKS can be fetched.
