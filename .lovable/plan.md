
## Goal

Push the coach's in-app nutrition targets (kcal / protein / carbs / fat) into each client's Cronometer account, keeping them **1:1 in sync**. Reads keep using the Pro API — the scraper is used **only for writing targets**, which drastically reduces the surface area that got accounts flagged before.

## Design principles (security & reliability)

1. **Scraper does one thing only**: log in once, POST target updates. No CSV export, no diary scraping, no page navigation loops.
2. **Human-like cadence**: never more than one push per client per day, jittered delays, realistic User-Agent + Accept-Language, session reused across days.
3. **Coach-enabled by default**: as soon as the coach saves targets for a client whose Cronometer link is active, we attempt a push. On first push we prompt the coach for the *client's* Cronometer credentials + TOTP (stored encrypted). No client-side password entry.
4. **Drift guard**: a daily reconcile job compares the last-pushed target hash with what the app currently has. If they match, we only re-verify weekly (cheap `GET /targets` via Pro API). If they don't match (or verification says Cronometer drifted), we re-push. This guarantees "same targets every day" without spamming Cronometer.
5. **Fail safe**: on 2FA challenge or session expiry, mark the link `needs_reauth`, notify the coach, stop retrying until they re-enter TOTP. Never loop-login (that's what flagged accounts before).
6. **Auditable**: every push logged in `cronometer_api_logs` with request/response, so we can see exactly what was sent.

## Data model (new)

```text
cronometer_web_sessions
├── id, coach_id, client_id                  -- FK, unique(coach_id, client_id)
├── cronometer_email        text
├── credentials_ciphertext  text             -- AES-GCM(password + totp_secret) using CRONO_WEB_KEY
├── session_cookies         text             -- encrypted cookie jar
├── user_agent              text             -- pinned per session
├── last_login_at           timestamptz
├── last_push_at            timestamptz
├── last_pushed_hash        text             -- sha256(kcal|p|c|f)
├── last_verified_at        timestamptz
├── status                  text             -- active | needs_reauth | error | disabled
├── last_error              text
```

RLS: only the owning coach can read/write; service_role full access. GRANTs added.

## Edge-function actions (extend `cronometer`)

- `web_connect` (coach) → email + password + optional TOTP → performs login, stores encrypted session, immediately does first push.
- `web_disconnect` (coach) → clears the session row.
- `web_push_targets` (coach) → manual "push now" button.
- `web_reconcile` (cron, daily 03:30 UTC) → for each `active` row:
  - Compute current target hash from `nutrition_plans`.
  - If hash != `last_pushed_hash` → push.
  - Else if `last_verified_at` older than 7 days → verify via Pro API `/targets`; push only if drifted.
- Internal `pushOnce(session, targets)` handles: refresh cookie if needed, POST target update, log everything.

## Auto-push hooks (in-app)

Fire-and-forget from the two places targets change:
- `NutritionWizard` save (coach sets a new plan).
- `WeeklyReviewTab` "apply to nutrition" step.

The client-side call is `supabase.functions.invoke('cronometer', { action: 'web_push_targets', client_id })`. Failures show a subtle toast but never block the coach's save.

## Frontend

Extend `CronometerCoachCard` with a **"Target sync"** subsection:
- Status pill: `Not connected` / `Active` / `Needs re-auth` / `Error`.
- Buttons: `Connect target sync`, `Push now`, `Disconnect`.
- Dialog for credentials + optional TOTP (masked inputs, warning that data is encrypted at rest).

Client-side UI: no change — this is coach-only.

## Cron

```sql
select cron.schedule(
  'cronometer-web-reconcile',
  '30 3 * * *',
  $$ select net.http_post(
      url:='https://<project>.supabase.co/functions/v1/cronometer',
      headers:=jsonb_build_object('x-cron-secret','<CRON_SECRET>'),
      body:=jsonb_build_object('action','web_reconcile')
    ); $$
);
```

## Secrets

- New: `CRONO_WEB_KEY` (32-byte, base64) — generated via `generate_secret`. Used for AES-GCM of credentials + cookies.
- Reused: `CRONOMETER_PRO_TOKEN`, `CRON_SECRET`.

## Reverse-engineering note

Cronometer's target update endpoint (`/user/targets/update` inside their SPA) uses cookie auth + XSRF token from `/login`. First implementation will:
1. GET `/login` to grab CSRF/session cookie.
2. POST `/login` with credentials (+ TOTP if requested).
3. GET `/cronometer/app` to warm session.
4. POST `/user/targets/update` with `{kcal, protein_g, carbs_g, fat_g}`.
5. Verify by parsing the response, then also cross-check via Pro API `/targets` on next reconcile.

If Cronometer changes the endpoint shape, only step 4 changes — everything else stays.

## What we're NOT building

- No scraper for diary/food-log reads (Pro API handles that).
- No push into MyFitnessPal (out of scope per your answer).
- No client-facing UI (coach-driven only).

## Rollout

1. Migration + secrets.
2. Edge-function additions + deploy.
3. UI in `CronometerCoachCard` + auto-push hooks.
4. Schedule cron.
5. Test end-to-end on a single client, then enable for others.
