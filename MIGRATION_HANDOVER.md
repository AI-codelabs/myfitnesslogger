# Migration handover — Lovable Cloud (Supabase) → Neon + Vercel

Status date: 13 Aug 2026. Audience: developer doing QA of the architecture and
verifying the migration.

---

## 1. Goal and target architecture

| Layer | Before | After |
| --- | --- | --- |
| Database | Supabase Postgres (Lovable Cloud) | Neon Postgres (`ep-super-butterfly-b1u1cypj`, eu-central-1), pooled connection |
| Data access | `supabase.from(...)` in the frontend, RLS enforced by PostgREST | `/api/pg/query` + `/api/pg/rpc` serverless endpoints, RLS enforced by impersonating the user inside a transaction |
| Auth | Supabase Auth | Neon Auth (dual-issuer accepted during transition) |
| Background/edge logic | 11 Supabase edge functions (Deno) | Vercel serverless functions under `api/` |
| File storage | Supabase Storage buckets | Vercel Blob (`api/storage/upload-url.ts`) |
| Hosting | Lovable | Vercel (`vercel.json`, Vite build) |

Design principle: **nothing is a big bang.** Every feature group can be flipped
between legacy and Neon with an env flag, with no code changes.

---

## 2. What has been done

### 2.1 Database
- Neon project created, region eu-central-1.
- Full `public` schema migrated: 33 tables plus enums, indexes, triggers,
  functions (`has_role`, `is_coach_of`, `get_clients_last_active`,
  `get_active_client_goal`), RLS policies and GRANTs.
- All rows copied from the legacy database, then **delta-synced again** after
  cutover (PK upsert; Neon-only rows preserved). `auth.users` synced (13 users;
  password hashes stay on the legacy provider while login does).
- Verification endpoint `api/admin/db-report.ts` compares row counts per table.
- **Storage:** 30 legacy objects copied into Vercel Blob at
  `{bucket}/{original_path}` (`onboarding-uploads` 21, `nutrition-documents` 8,
  `nutrition-templates` 1; `email-assets` was empty). New UI uploads go to Blob.
  Reads prefer the copied pathname, then a legacy signed URL.

### 2.2 Access layer (the migration switch)
- `src/lib/api/pg.ts` — a Supabase-compatible query builder that serialises the
  query and posts it to `/api/pg/query`.
- `src/lib/db.ts` — `db.from(table)` routes to Neon or legacy per feature group
  (`FEATURE_TABLES`), driven by `VITE_NEON_FEATURES`.
- `src/lib/api/fn.ts` — `invokeFn(name)` routes function calls to either the
  ported `/api/...` endpoint or the legacy edge function (`functions` flag).
- `src/lib/dataApi.ts` — thin helpers for the purpose-built endpoints
  (`api/weight/*`, `api/checkins/*`).
- ~51 frontend files rewritten from `supabase.from(...)` to `db.from(...)`, and
  ~10 files from `supabase.functions.invoke` to `invokeFn`.

Feature groups and their tables are defined in `src/lib/db.ts`:
`weight`, `checkins`, `workouts`, `nutrition`, `clients`.

### 2.3 Serverless API (`api/`)
Shared infra:
- `_lib/db.ts` — pooled `pg` client (max 1, serverless friendly).
- `_lib/auth.ts` — JWT verification, **dual issuer**: Neon Auth JWKS and legacy
  Supabase JWKS.
- `_lib/rls.ts` — `withRls` (sets the request user so policies apply) and
  `withService` (service-level access for background jobs).
- `_lib/handler.ts` / `_lib/fn.ts` — CORS, method checks, Zod validation, error
  mapping, cron-secret auth.
- `_lib/query.ts` — SQL builder for the generic query endpoint (identifier
  quoting, parameterised values only).

Ported endpoints (all previously Supabase edge functions):

| Legacy function | New endpoint |
| --- | --- |
| cronometer | `api/cronometer/index.ts` (+ `_lib/crypto.ts`, `proClient.ts`, `webPush.ts`) |
| nutrition-ingest | `api/nutrition/ingest.ts` |
| check-expirations | `api/cron/check-expirations.ts` |
| delete-client | `api/clients/delete.ts` |
| gmail-oauth-start / -callback | `api/gmail/oauth-start.ts`, `api/gmail/oauth-callback.ts` |
| send-invite-email | `api/email/send-invite.ts` |
| send-test-checkin-email | `api/email/send-test-checkin.ts` |
| send-checkin-reminders | `api/email/send-checkin-reminders.ts` |
| generate-coach-message | `api/ai/generate-coach-message.ts` |
| generate-weekly-review | `api/ai/generate-weekly-review.ts` |
| (pg_cron hourly pull) | `api/cron/cronometer-pull.ts` |

Plus purpose-built: `api/weight/{list,log,delete}.ts`,
`api/checkins/{list,submit}.ts`, `api/storage/upload-url.ts`,
`api/admin/db-report.ts`, `api/health.ts`, `api/pg/{query,rpc}.ts`.

Cronometer behaviour is preserved 1:1: AES-GCM credential encryption, Pro API
reads, coach-session scraper for target pushes (manual only), and the
`gold_required` / `export_forbidden` error mapping.

### 2.4 Scheduling
`vercel.json` crons replace pg_cron:
- hourly `/api/cron/cronometer-pull`
- daily 06:30 `/api/cron/check-expirations`
- Sunday 17:00 and Monday 08:00 check-in reminders

Cron auth: `CRON_SECRET` or the `cron_token` row in `internal_secrets`.

### 2.5 Deployment config
- `vercel.json`: Vite framework, SPA rewrite that excludes `/api/`, 60s max
  function duration.
- `scripts/push-vercel-env.ts` pushes all env vars to the Vercel project.
- Env vars set on Vercel: `DATABASE_URL`, `NEON_AUTH_*`, `LEGACY_AUTH_URL`,
  `ADMIN_API_SECRET` (generated), `CRON_SECRET`, `ANTHROPIC_API_KEY`,
  `CRONOMETER_PRO_TOKEN`, `CRONO_COACH_EMAIL/PASSWORD`, `CRONO_WEB_KEY`,
  `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `PUBLIC_APP_URL`, the three `VITE_SUPABASE_*`
  build-time vars, and `VITE_NEON_FEATURES`.
- Three manual steps outstanding at last handover: trusted domain in Neon Auth,
  Vercel Blob store attached, first deploy triggered.

---

## 3. What is still open

<<<<<<< HEAD
1. **Auth migration itself.** Feature flags are on
   (`weight,checkins,workouts,nutrition,clients,functions`). The API accepts
   both issuers, but users still sign in through the legacy client
   (`src/integrations/supabase/client.ts`, `src/hooks/useAuth.tsx`). Moving
   sign-up/login/reset to Neon Auth is **not done**.
2. **Legacy code still present.** `supabase/functions/*` and the Supabase
   client remain as auth + signed-URL fallback. Delete only after the auth
   cutover and a period of Blob-only reads.
3. **Decommission the legacy project** after auth is on Neon Auth and Blob
   reads have been stable (signed-URL fallback no longer needed).

Done since the last handover: Postgres delta re-sync, Storage → Blob copy
(30 files at `{bucket}/{original_path}`), UI uploads to Blob, and read paths
prefer Blob then fall back to legacy signed URLs.
=======
0. **Delta copy done (13 Aug 2026).** All 33 public tables re-synced from the
   legacy database into Neon by primary-key upsert (rows with a newer
   `updated_at` upstream were refreshed; rows written on Neon after cutover were
   preserved). `auth.users` synced from the legacy admin API (13 users; password
   hashes are not exported and are not needed while login stays on the legacy
   provider). Row counts verified equal or higher on Neon for every table.
   Storage copied too: 30 files from `onboarding-uploads`,
   `nutrition-documents`, `nutrition-templates` (and empty `email-assets`) into
   Vercel Blob at `{bucket}/{original_path}`, private access, sizes verified.
1. **Cutover flags.** `VITE_NEON_FEATURES` is the single control. Only the
   groups listed there run on Neon.
   - `weight`, `checkins` — validated first, safe.
   - `workouts` — ready, no legacy writers.
   - `nutrition`, `clients` — depend on the `functions` flag being on, because
     legacy edge functions and database triggers still write those tables.
   - `functions` — flips all ported endpoints at once; there is no per-function
     flag.
2. **Auth migration itself.** The API accepts both issuers, but users still
   sign in through the legacy client (`src/integrations/supabase/client.ts`,
   `src/hooks/useAuth.tsx`). Moving sign-up/login/reset to Neon Auth and
   migrating user records is **not done**.
3. **Storage read paths.** Files now exist in Blob, but the app still reads
   existing progress photos and nutrition documents through legacy signed URLs;
   switch those read paths before decommissioning the legacy project.

4. **Legacy code still present.** `supabase/functions/*` (11 functions) and the
   Supabase client remain in the repo as the fallback path. Delete only after
   full cutover.
5. **Final delta sync + cutover.** Read-only window, final data sync, flip all
   flags, smoke test, then decommission the legacy project.
6. **Row-count / integrity verification** after each re-copy via
   `/api/admin/db-report` (requires `ADMIN_API_SECRET`).
>>>>>>> origin/main

---

## 4. QA checklist for the developer

Infrastructure
- `GET /api/health` → 200.
- `GET /api/weight/list` with a valid bearer token → 200; without → 401.
- `GET /api/admin/db-report` with `x-admin-secret` → row counts match legacy.
- Confirm SPA deep links work and `/api/*` is not swallowed by the rewrite.

Security (highest-risk area of this migration)
- `api/pg/query.ts` runs under `withRls`: verify a coach cannot read another
  coach's clients, and a client cannot read other clients' rows, by calling the
  endpoint directly with a crafted payload.
- `api/pg/rpc.ts` only allows four whitelisted functions — confirm the
  allowlist and argument validation cannot be bypassed.
- Confirm `_lib/query.ts` never interpolates user input outside of parameters
  (identifiers are quoted via `ident`).
- Confirm service-level endpoints (`_lib/fn.ts`, `withService`) require either
  a verified user JWT or the cron secret.

Functional (per feature group, with the flag on and off)
- Weight logging incl. comma decimals; weekly check-in submit + compare-all-weeks.
- Workout plans: create, duplicate, template propagation dialog, session logging.
- Nutrition: meal plan editor, client meal view, compliance heatmap, Cronometer
  connect / pull / manual target push.
- Clients: invite email, onboarding, notifications, expiration job, delete client.
- AI: coach message and weekly review generation.
- Cron endpoints hit manually with the cron secret.

---

## 5. Key files to read first

```
vercel.json                 deployment + cron config
DEPLOY_VERCEL.md            env vars and cutover flags
src/lib/db.ts               table → feature group routing
src/lib/api/pg.ts           Supabase-compatible query shim
src/lib/api/fn.ts           function call routing
api/_lib/auth.ts            dual-issuer JWT verification
api/_lib/rls.ts             RLS impersonation vs service access
api/_lib/query.ts           SQL builder (security-critical)
api/pg/query.ts             generic data endpoint
```
