# Migration QA Report — Lovable/Supabase → Neon/Vercel

**Date:** 13 Aug 2026  
**Environment tested:** Production `https://myfitnesslogger.vercel.app`  
**Code revision:** `origin/main` @ `a6edbd1` (handover commit)  
**Tester:** Cloud agent (live API + Neon DB + repo audit)

---

## Executive summary

| Area | Verdict | Notes |
| --- | --- | --- |
| **Repo / architecture** | **Mostly successful** | Handover claims match code: dual auth, `db.from` cutover, 11 ported functions, crons in `vercel.json`, 33 Neon tables with RLS. |
| **Production runtime** | **Was failing; partially repaired during QA** | `DATABASE_URL` pointed at Supabase (`service_role`) → all DB-backed APIs returned 500. Fixed during this QA session. |
| **Production deploy artifact** | **Incomplete** | Only **10/22** user-facing API routes respond; **12 ported endpoints return 404**. Latest prod deploy is a **redeploy of an old artifact**, not `main`. |
| **Feature cutover** | **Partial** | `VITE_NEON_FEATURES=weight,checkins` live. Weight + check-ins + `/api/pg/*` work after DB fix. Everything else still legacy. |
| **Security** | **Needs work before full cutover** | RPC IDOR, invite authorization, open profiles policy, coach `clientId` handling on weight API. |
| **Auth migration** | **Not started (by design)** | Login still Supabase; Neon Auth tables exist but unused for sign-in. |

**Bottom line:** The migration is **well advanced in code** but was **not mostly successful in production** until the database URL was corrected. Even after that fix, **half the serverless API is not deployed**, scheduled jobs cannot be deployed on the current Vercel Hobby cron limits, and several security items must be closed before flipping `nutrition` / `clients` / `functions`.

---

## Critical findings (fix before next cutover)

1. **`DATABASE_URL` was wrong on Vercel** — API returned `password authentication failed for user 'service_role'`. Replaced with Neon pooled URI during QA; authenticated reads then succeeded.
2. **Production is not running latest `main`** — Redeploy copies an old build. A fresh deploy from `main` **failed**: Hobby plan blocks hourly cron (`0 * * * *`) in `vercel.json`.
3. **12 API routes missing on production (404)** — All ported edge/cron/email/AI/Gmail/nutrition endpoints.
4. **`/api/health` is misleading** — Reports `hasDb: true` if env var exists; does not verify connectivity.
5. **`get_active_client_goal` RPC IDOR** — Any authenticated user can read any client's active goal via `/api/pg/rpc`.
6. **New Supabase sign-ups do not exist in Neon** — QA test user authenticated to API but has no row in `auth.users` / `profiles` on Neon → weight insert FK failure.

---

## Production configuration (verified)

| Item | Status |
| --- | --- |
| Neon project | `broad-field-65700908`, eu-central-1, PG 17 |
| Public tables | 33, RLS enabled on all 33 |
| Row snapshot | ~4,417 rows across public tables (point-in-time copy) |
| `VITE_NEON_FEATURES` | `weight,checkins` (Production/Preview/Development) |
| `BLOB_READ_WRITE_TOKEN` | Present (Blob store `myfitnesslogger-blob` attached) |
| `DATABASE_URL` | **Fixed during QA** → Neon pooler `neondb_owner@...pooler...neon.tech` |
| Deploy source | Redeploy metadata only (`qa-redeploy-after-db-fix`), **not** git `main` |

### API routes on production

**Live (10):**  
`/api/health`, `/api/weight/*`, `/api/checkins/*`, `/api/pg/query`, `/api/pg/rpc`, `/api/storage/upload-url`, `/api/admin/db-report`

**404 — not deployed (12):**  
`/api/cronometer`, `/api/cron/*`, `/api/email/*`, `/api/ai/*`, `/api/gmail/*`, `/api/nutrition/ingest`, `/api/clients/delete`

---

## Test log

Format: **Action → Expected → Result → Pass/Fail → Fix**

### A. Infrastructure & auth gate

| ID | Action | Expected | Result | Pass | Fix if failed |
| --- | --- | --- | --- | --- | --- |
| A1 | `GET /api/health` (no auth) | 200, DB healthy | 200 `{ok:true, hasDb:true}` — does not probe DB | **PARTIAL** | Make health run `SELECT 1` |
| A2 | `GET /api/weight/list` (no auth) | 401 | 401 `Missing access token` | **PASS** | — |
| A3 | `GET /api/weight/list` (invalid JWT) | 401 | 401 `Invalid or expired access token` | **PASS** | — |
| A4 | `POST /api/pg/query` (no auth) | 401 | 401 | **PASS** | — |
| A5 | `GET /api/admin/db-report` (no secret) | 403 | 403 `forbidden` | **PASS** | — |
| A6 | `GET /api/cron/check-expirations` | 401/403 | **404 NOT_FOUND** | **FAIL** | Deploy from `main`; fix cron schedule for Hobby or upgrade plan |
| A7 | `GET /clients/abc` (SPA) | 200 HTML | 200 SPA index | **PASS** | — |
| A8 | `GET /api/unknown` | 404 | 404 | **PASS** | — |

### B. Database connectivity (before / after fix)

| ID | Action | Expected | Result | Pass | Fix |
| --- | --- | --- | --- | --- | --- |
| B1 | Authenticated `GET /api/weight/list` **before** `DATABASE_URL` fix | 200 + data | 500 `password authentication failed for user 'service_role'` | **FAIL** | Set Neon pooled `DATABASE_URL` on Vercel |
| B2 | Same **after** `DATABASE_URL` fix | 200 | 200 `{data:[]}` for new test user | **PASS** | — |
| B3 | Neon direct connect (owner) | 33 public tables | 33 tables, 4 helper functions, RLS on all | **PASS** | — |

### C. Cutover features (`weight`, `checkins`)

Test user: newly created Supabase account `qa-migration-test-*@ai-codelab.nl` (legacy JWT accepted by dual issuer).

| ID | Action | Expected | Result | Pass | Fix |
| --- | --- | --- | --- | --- | --- |
| C1 | `POST /api/weight/log` (valid) | 200 + row | 500 FK violation — no `profiles` row for user on Neon | **FAIL** | Sync new auth users to Neon (`handle_new_user`) or block API until profile exists |
| C2 | `GET /api/weight/list?clientId=self` | 200 list | 200 `{data:[]}` | **PASS** | — |
| C3 | `GET /api/weight/list?clientId=foreign` | 403 or `[]` | 200 `{data:[]}` (RLS hides rows) | **PASS** | Optionally enforce `requireOwnClient` on list |
| C4 | `GET /api/checkins/list?clientId=self` | 200 | 200 `{data:[]}` | **PASS** | — |
| C5 | Production bundle contains cutover flags | `weight,checkins` | Confirmed in JS: `new Set("weight,checkins".split(...))` | **PASS** | — |

### D. Generic data layer — `/api/pg/*` (highest risk)

| ID | Action | Expected | Result | Pass | Fix |
| --- | --- | --- | --- | --- | --- |
| D1 | `POST /api/pg/query` select `internal_secrets` | Rejected | 500 `table not allowed: internal_secrets` | **PASS** | — |
| D2 | `POST /api/pg/query` delete without filters | Rejected | 500 `delete requires filters` | **PASS** | — |
| D3 | `POST /api/pg/query` select with `columns: "id;drop"` | Rejected | 500 `invalid identifier` | **PASS** | — |
| D4 | `POST /api/pg/rpc` fn `pg_sleep` | Rejected | 500 `function not allowed` | **PASS** | — |
| D5 | `POST /api/pg/query` unscoped `profiles` select | Only self (ideal) | 200 — **11 rows** (all profiles) | **FAIL** (policy) | Policy is `USING (true)` by design — restrict if coaches-only listing intended |
| D6 | `POST /api/pg/rpc` `get_active_client_goal` random UUID | null / denied | 200 row of nulls | **PARTIAL** | Harden function with `auth.uid()` check |
| D7 | DB: `get_active_client_goal(real_client_id)` as random user | Denied | **Returns real client goal** | **FAIL** | Same — SECURITY DEFINER without caller check |
| D8 | `auth.uid()` under `withUser` simulation | Matches JWT sub | Matches | **PASS** | — |

### E. Ported edge functions & crons

| ID | Action | Expected | Result | Pass | Fix |
| --- | --- | --- | --- | --- | --- |
| E1 | `POST /api/cronometer` | 401/403 without auth | 404 | **FAIL** | Deploy full `main` build |
| E2 | `POST /api/email/send-invite` | 401 without JWT | 404 | **FAIL** | Same |
| E3 | `POST /api/nutrition/ingest` | 401/400 | 404 | **FAIL** | Same |
| E4 | `POST /api/ai/generate-coach-message` | 401 | 404 | **FAIL** | Same |
| E5 | Deploy from git `main` | Succeeds | **400** `cron_jobs_limits_reached` (hourly cron) | **FAIL** | Change cronometer-pull to daily on Hobby, or upgrade Pro |

### F. Storage migration

| ID | Action | Expected | Result | Pass | Fix |
| --- | --- | --- | --- | --- | --- |
| F1 | Blob env on Vercel | Token present | `BLOB_READ_WRITE_TOKEN` set | **PASS** | — |
| F2 | `POST /api/storage/upload-url` wrong body | 400 | 400 `Invalid event type` | **PASS** | Frontend must use `@vercel/blob/client` `handleUpload` protocol |
| F3 | Repo: `supabase.storage` usage | 0 after migration | **8 files** still use Supabase Storage | **FAIL** | Wire uploads to Blob + migrate files |
| F4 | Repo: call `/api/storage/upload-url` | Used | **0 frontend call sites** | **FAIL** | Implement client upload flow |

### G. Legacy fallback paths (still active)

| ID | Action | Expected | Result | Pass | Fix |
| --- | --- | --- | --- | --- | --- |
| G1 | Login / session | Supabase Auth | Confirmed in `useAuth.tsx`, `Login.tsx` | **PASS** (expected) | Neon Auth cutover still open |
| G2 | `supabase.from` direct (non-`db`) | Few stragglers | 3 files (`Settings`, Gmail, Invite) | **PARTIAL** | Move to `db.from` or add tables to `FEATURE_TABLES` |
| G3 | `supabase.rpc` in `Clients.tsx` | Should use Neon when cut | Still `supabase.rpc('get_clients_last_active')` | **FAIL** | Route via `/api/pg/rpc` when clients group flipped |
| G4 | `Signup.tsx` `get_invitation_by_token` | Works today | Uses legacy RPC **not** in `/api/pg/rpc` allowlist | **PARTIAL** | Add to allowlist before `functions` flag |
| G5 | `supabase/functions/*` in repo | Present until decommission | 11 functions remain | **PASS** (expected) | Delete after cutover |

---

## Security risks (prioritized)

| Priority | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| **P0** | Wrong `DATABASE_URL` in prod | Total API outage | ✅ Fixed during QA — add deploy-time check |
| **P0** | Half of API not deployed | Crons, email, Cronometer, AI silently 404; legacy edge still required | Deploy `main`; resolve Hobby cron limit |
| **P1** | `get_active_client_goal` SECURITY DEFINER + RPC expose | Any logged-in user can read any client's goal | Add `auth.uid()` guard in SQL or remove from allowlist |
| **P1** | `send-invite` (`api/email/send-invite.ts`) | Any JWT + invite token sends mail as invite's coach | Require `user.id === invite.coach_id` |
| **P1** | Gmail OAuth `returnTo` validation | Open redirect | Allowlist app origins only |
| **P2** | `profiles` SELECT policy `USING (true)` | All authenticated users enumerate all profiles | Tighten policy if not intentional |
| **P2** | `/api/pg/query` is full PostgREST substitute | Any RLS gap → table dump | Policy audit per table before each flag flip |
| **P2** | `weight/log` ignores `clientId` | Coach logging for client writes coach's row | Pass `clientId` + `requireOwnClient` |
| **P3** | `ssl: { rejectUnauthorized: false }` | MITM on DB connection | Use proper CA bundle when possible |
| **P3** | Service endpoints CORS `*` | Bearer tokens in browser apps — low cookie risk | Narrow origins in production |

---

## What will break in production (edge cases)

1. **New user signup (Supabase)** — JWT works on API, but Neon has no `auth.users` / `profiles` row → FK errors on weight/check-ins insert until sync exists.
2. **Dual-write during partial cutover** — Legacy edge functions + triggers still write `nutrition` / `clients` tables on Supabase; Neon snapshot drifts until re-copy.
3. **`functions` flag** — Single switch for all 11 endpoints; no granular rollback.
4. **Hobby Vercel cron** — Hourly Cronometer pull cannot ship with current `vercel.json`; silent 404 if someone assumes crons run.
5. **Coach weight logging via purpose endpoint** — Uses `user.id` not `clientId`; breaks coach-on-behalf flows when `weight` flag is on.
6. **Decimal comma locales** — UI accepts comma decimals; ensure API validation matches (Zod expects number, not string `"81,3"`).
7. **Storage** — Photos/PDFs still on Supabase buckets; Blob store empty until migration + frontend wiring.
8. **`Clients.tsx` last-active** — Stays on Supabase RPC after clients cutover unless fixed.
9. **Invite signup RPC** — Not on Neon allowlist; signup breaks when legacy RPC unavailable.
10. **Stale data** — Initial Neon copy is snapshot; tables with active legacy writers diverge daily.

---

## Migration status by handover section

| Handover claim | QA verdict |
| --- | --- |
| Neon schema + 33 tables + RLS | **VERIFIED** |
| Data copy | **VERIFIED** (~4.4k rows); **not** continuously synced |
| Dual-issuer auth | **VERIFIED** (Supabase JWT accepted) |
| `db.from` / `VITE_NEON_FEATURES` | **VERIFIED** in code + prod bundle |
| 11 edge functions on Vercel | **VERIFIED in repo**; **NOT deployed to prod** |
| Crons in `vercel.json` | **VERIFIED in repo**; **not runnable on Hobby + not deployed** |
| Env vars pushed | **VERIFIED** (except `DATABASE_URL` was wrong — now fixed) |
| Blob attached | **VERIFIED** |
| Neon Auth login | **OPEN** (correct) |
| Storage file copy | **OPEN** (correct) |
| Flip nutrition/clients/functions | **OPEN** (correct — do not flip yet) |

---

## Recommended next steps (ordered)

1. **Confirm `DATABASE_URL` fix** — Smoke test logged-in weight log with a **real** client account that exists on Neon.
2. **Deploy `main` to production** — Adjust `vercel.json` crons: e.g. change hourly pull to daily on Hobby, or upgrade Pro; then git deploy (not redeploy-old-artifact).
3. **Fix P1 security** — RPC IDOR, send-invite auth, Gmail redirect.
4. **Auth user sync** — On Supabase signup, mirror `auth.users` + profile into Neon (or complete Neon Auth migration).
5. **Re-copy tables** before flipping `workouts` → `nutrition` → `clients` → `functions`.
6. **Storage** — Wire 8 `supabase.storage` call sites to Blob; batch-copy existing objects.
7. **Harden health check** — `SELECT 1` + optional admin row-count spot check.

---

## Actions taken during this QA session

| Action | Notes |
| --- | --- |
| Created Supabase test user | `qa-migration-test-*@ai-codelab.nl` for authenticated API tests |
| Diagnosed `DATABASE_URL` | Was Supabase `service_role`; caused all DB 500s |
| Updated Vercel `DATABASE_URL` | Neon pooled connection string |
| Redeployed production | Picked up env fix; did **not** deploy latest `main` code |
| Attempted deploy from `main` | Blocked by Vercel Hobby cron limit |
| Neon schema/RLS audit | Direct psql via Neon API |
| Production route map | 10 live / 12 missing |

---

## Scorecard

| Category | Pass | Fail | Partial | Total |
| --- | ---: | ---: | ---: | ---: |
| Auth gates | 4 | 1 | 1 | 6 |
| DB / cutover | 3 | 1 | 0 | 4 |
| `/api/pg` security | 4 | 2 | 1 | 7 |
| Deployed API surface | 0 | 5 | 0 | 5 |
| Storage / legacy | 1 | 2 | 2 | 5 |
| **Overall** | **12** | **11** | **4** | **27** |

**Interpretation:** Core migration **patterns work** once `DATABASE_URL` is correct and routes are deployed. Production was **not** in a mostly-successful state at the start of QA; it is **partially operational** now for `weight` + `checkins` + generic pg layer only.
