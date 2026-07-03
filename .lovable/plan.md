# Cronometer Pro API Integration Plan

## 1. Recommended architecture

Yes — the Pro invite flow is the right choice. It gives us one long-lived Pro bearer token (belonging to your coach account) and a stable `client_id` per connected client. All reads (`data_summary`, `diary_summary`, `macro_summary`, `targets`, `fasting_summary`) accept a `client_id` argument, so we never need per-user OAuth, per-user tokens, passwords, TOTP, or session cookies. Clients accept a Cronometer-sent invite email once and are then permanently linked.

```text
Coach app  ──► Edge Function ──► Cronometer API
                    │              (Bearer = Pro token,
                    │               body.client_id = client)
                    ▼
             Lovable Cloud DB
             (cronometer_clients, cronometer_nutrition_logs)
```

One edge function (`cronometer`) handles: `invite_client`, `remove_client`, `refresh_status`, `sync_client`, `sync_all`, `get_targets`. A daily cron calls `sync_all` for every linked, active client.

## 2. Authentication & authorization

- **Cronometer side**: one Pro OAuth app registered under your Pro account. You do the OAuth dance once yourself (interactive, in a browser) to mint a bearer token for your Pro account. That token is stored as the `CRONOMETER_PRO_TOKEN` secret. All Pro/User-Data endpoints use `Authorization: Bearer <CRONOMETER_PRO_TOKEN>` + `body.client_id`.
- **App side**: only authenticated coaches (checked via `getClaims` and `has_role('coach', ...)` or `is_coach_of`) can invite/remove/sync; clients can read their own `cronometer_nutrition_logs` rows via existing RLS.
- **Secrets to add**: `CRONOMETER_PRO_TOKEN`, `CRONOMETER_CLIENT_ID`, `CRONOMETER_CLIENT_SECRET` (last two only needed to mint/rotate the token).

## 3. Endpoints we use

| Purpose | Endpoint | Notes |
|---|---|---|
| Invite client | `POST /api_v1/client_invite` | `{email, name}` → returns `client_id`. Store immediately. |
| Remove client | `POST /api_v1/client_remove` | On disconnect. |
| Poll status | `POST /api_v1/client_status` | Empty body = full list. Use to reconcile `EXTERNAL_CLIENT_PENDING → EXTERNAL_CLIENT`. |
| List available days | `POST /api_v1/data_summary` | `{start, end, client_id}` → array of dates the client actually logged. Drives which days to fetch. |
| Fetch a day's diary | `POST /api_v1/diary_summary` | `{day, client_id}` → meals, macros, full micronutrients. Primary sync payload. |
| Macro-only (fast) | `POST /api_v1/macro_summary` | Optional lightweight refresh. |
| Targets | `POST /api_v1/targets` | Pull client's own Cronometer targets (read-only; no push endpoint exists in the API). |
| Fasting | `POST /api_v1/fasting_summary` | Optional, phase 2. |

Endpoints we deliberately do NOT touch: `/oauth/*` (per-user flow), `/buy_gold`, `/sso/*`.

**Important API limitation**: there is no write endpoint. `push_targets` (currently in our scraper) has no API equivalent — we drop that feature and instead surface Cronometer's own targets in the coach UI. This is a real regression that the user should be aware of before we build.

## 4. Data sync strategy

**On invite**: create `cronometer_clients` row with `status = 'pending'`. Show pending badge in UI. Cronometer emails the client; nothing to sync yet.

**Status reconciliation**: hourly (or on coach page load) call `client_status`; when status flips to `EXTERNAL_CLIENT`, mark row `active` and enqueue an initial backfill (last 90 days).

**Initial backfill / re-sync**: `data_summary(start=today-90d, end=today)` → for each returned day, `diary_summary(day, client_id)` → upsert into `cronometer_nutrition_logs` on `(client_id, log_date)`. Wipe existing rows for that client first (per user's choice).

**Incremental daily sync**: cron at 04:00 UTC runs `sync_all`. For each active client: `data_summary(start=last_logged_day-2d, end=today)`, re-fetch those days (covers late edits to yesterday/today), upsert.

**Rate limiting / batching**: process clients sequentially with a small delay; per-client, cap parallel `diary_summary` calls to 3. Any 4xx from Cronometer → log + mark client `error` with reason; continue with next client. 5xx → retry with exponential backoff (3 attempts), then defer to next cron.

**Edge cases**:
- Client hasn't accepted invite yet → `client_status` still `PENDING`; skip sync.
- Client removed themselves in Cronometer → `client_status` won't list them → mark `revoked` and stop syncing.
- Empty day (no diary) → still upsert a zero-row so UI can distinguish "no data yet" from "logged nothing".
- Bearer token expired/revoked → all calls 401; surface a single dashboard-level warning and stop cron until token is refreshed.

## 5. API limitations to flag

1. **No write endpoints** — cannot push macro targets, foods, or diary entries. Drop `push_targets` UI/copy.
2. **No webhooks** — sync is poll-only.
3. **Invite requires client's email** — internal clients (no email) are possible but they can't log data themselves, so we won't expose that path.
4. **Unofficial rate limits** — Cronometer's docs don't publish limits; we self-throttle.
5. **Token lifetime unspecified** — treat as long-lived but build a manual "rotate token" admin action.
6. **Targets are per-day** — must pass the day; we'll fetch today's on demand.

## 6. Implementation roadmap

**Phase 0 — Prerequisites (user action)**
1. In Cronometer Pro dashboard, register the OAuth application; capture `client_id`, `client_secret`, and the allowed redirect URL.
2. Run the one-off OAuth flow in a browser (documented script) to mint the Pro bearer token for your own Pro account.
3. Provide the three values so we can store `CRONOMETER_PRO_TOKEN`, `CRONOMETER_CLIENT_ID`, `CRONOMETER_CLIENT_SECRET`.

**Phase 1 — Schema migration**
- New `cronometer_clients` table: `id, coach_id, client_id (our uuid), cronometer_client_id (bigint), email, name, status ('pending'|'active'|'revoked'|'error'), last_error, invited_at, connected_at, last_synced_at, last_synced_day`.
- Keep `cronometer_nutrition_logs` as-is; add FK/index on `(client_id, log_date)`; add `source` column defaulting to `'api'`.
- Drop tables: `cronometer_sessions`, `cronometer_target_pushes`, `nutrition_ingest_tokens` (+ their policies/grants).
- Drop config toggles for target push / shortcut ingest.

**Phase 2 — Edge function rewrite (`supabase/functions/cronometer/index.ts`)**
- Replace all scraper code with a thin Cronometer REST client (`postCronometer(path, body)`).
- Actions: `invite_client`, `remove_client`, `refresh_status`, `sync_client(client_id, {full?: boolean})`, `sync_all` (cron), `get_targets(client_id, day)`.
- Auth: `getClaims` + coach role check for coach-invoked actions; `x-cron-secret` header for `sync_all`.

**Phase 3 — New cron function or reuse existing scheduler**
- Daily cron (Supabase scheduled function or `pg_cron` calling the edge fn) → `sync_all`.
- Hourly lightweight `refresh_status` cron to flip pending → active promptly.

**Phase 4 — Frontend rewrite**
- Delete: `CronometerConnectDialog`, `CronometerLoginForm`, `AppleHealthShortcutCard`, `AppleHealthShortcutDialog`, `lib/nutritionIngest.ts`, `lib/cronometerTargets.ts`, current `lib/cronometer.ts` scraper wrappers.
- New: `CronometerInviteDialog` (email + name), `CronometerClientStatusCard` (pending/active/revoked/error + "Resend invite" + "Disconnect"), `useCronometerClient(clientId)` hook.
- Client `Nutrition` page keeps existing `FoodLogTable` / `NutritionWeeklyOverview` — data source unchanged, only ingestion changes.

**Phase 5 — Backfill & cleanup**
- On coach's first visit post-deploy: for each existing linked client, prompt to re-invite via API (old scraper links are gone). Wipe `cronometer_nutrition_logs` per client on re-connect.

**Phase 6 — QA**
- Invite a test client, accept from a second Cronometer account, run `sync_client`, verify diary + macros land in DB and render in UI.
- Simulate 401 (bad token) and confirm dashboard warning.
- Confirm cron picks up new day and handles empty days.

## 7. Assumptions & open questions

- You already have a Cronometer Pro subscription with API access enabled (the docs page implies this is a per-Pro-account entitlement).
- Coaches are OK re-inviting existing clients (old scraper connections are not migratable).
- Losing "push macro targets to Cronometer" is acceptable — the API doesn't support it. If not, we'd have to keep a scraper path for that one action only; I recommend against.
- Bearer token rotation cadence is unknown; we'll build a manual re-mint script and monitor 401s.
- Whether cron should be Supabase Scheduled Functions or `pg_cron + net.http_post` — pick during Phase 3; both work.

Ready to proceed to Phase 0 (you registering the OAuth app and providing the three secrets) once you approve this plan.
