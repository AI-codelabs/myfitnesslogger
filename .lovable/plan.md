## Client/Coach feedback — triage & rollout plan

Sprint 1 shipped (items 1–5). Remaining work below with your latest answers baked in.

---

### Answers received (2026-07-08)

- **Expiration notifications:** in-app only, at **7 / 3 / 1 days** before expiry, for **both client and coach**. After expiry: keep client `active` with a "Renewal due" badge (no auto-inactivate).
- **Cronometer meals:** leave as-is. Improve the empty state copy only.
- **Nutrition templates:** coach fills macro targets manually per template. Best-match suggestion always requires coach approval before attaching.
- **Water formula confirmed:** `35 ml × body weight (kg) + 500 ml per training hour`. Supplement rule set: creatine 5 g/day, whey based on protein gap, vitamin D if low sun exposure, omega-3, magnesium.
- **Strength graph:** per-exercise picker (line chart of estimated 1RM via Epley).
- **Step counter:** parked for now.
- **Template edit error:** still needs repro details — which template area, action, error text/screenshot.

Home UI screenshot noted for reference (client "Vandaag" view, check-in card, steps goal card, to-dos, habits). No changes requested there yet.

---

### Sprint 2 — Notifications + bug hunt

**A. Expiration notifications (in-app, 7/3/1 days)**
- New scheduled edge function `check-expirations` (daily via `pg_cron`).
- For every active `client_invitations` / relationship with `expires_at`, insert a `notifications` row when today = expires_at − {7, 3, 1} days, targeting both coach and client.
- Idempotency: dedupe on `(user_id, invitation_id, days_before)`.
- Post-expiry: keep record `active`, render "Renewal due" badge in `Clients.tsx` and the coach dashboard.

**B. Cronometer meals empty state**
- In `FoodLogTable` / nutrition day detail, when no per-meal entries exist but daily totals do, show: *"Cronometer only shares daily totals with coaches — per-meal detail isn't available."*

**C. Check-in reminder email diagnostic**
- Audit `send-checkin-reminders` cron schedule + `email_send_log` for the affected coach, confirm `coach_email_connections` row is valid, fix wiring.

**D. Template edit error** — blocked on repro.

---

### Sprint 3 — Nutrition plan templates + onboarding formulas

**A. `nutrition_plan_templates` table**
Columns: `id, coach_id, name, goal_type ('cut'|'bulk'|'maintain'), target_kcal, protein_g, carbs_g, fat_g, pdf_path, created_at`. RLS: coach owns rows. Storage bucket `nutrition-templates` (private, signed URLs).

**B. Coach page `NutritionTemplates.tsx`**
List / upload / edit / delete templates. Upload PDF + fill macro targets manually.

**C. Auto-match after onboarding**
- Compute client target macros (extend `cronometerTargets.ts` logic).
- Rank coach's templates filtered by `goal_type` using Euclidean distance across `(kcal, protein, carbs, fat)` normalized.
- Surface top match in coach dashboard "Action required" block → coach approves → attach via existing `client_nutrition_documents` flow. Never auto-attach.

**D. Water + supplement facts in onboarding AI**
In `generate-coach-message`, compute deterministically and inject as facts:
- `water_ml = round(35 * weight_kg + 500 * weekly_training_hours / 7)`
- Supplements: creatine 5 g/day; whey if `(target_protein − dietary_protein_estimate) > 30 g`; vitamin D if low sun exposure flag; omega-3 default; magnesium default.
Prompt the model to phrase them, not invent them.

---

### Sprint 4 — Strength progression graph

- New `StrengthProgressChart` in `ClientProgressionTab` / `Progression.tsx`.
- Exercise picker (searchable, defaults to most-logged compound).
- Line chart of estimated 1RM per session using Epley: `weight × (1 + reps / 30)`, taking the top set per session.
- Data source: `workout_set_logs` joined to exercises.
- X-axis: session date; range selector 4w / 12w / all.

---

### Backlog

- **Step counter** — parked (revisit when native/Capacitor is on the table, or add manual entry + Fitbit OAuth).
- **Template edit error** — awaiting repro.
