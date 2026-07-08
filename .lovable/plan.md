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

### Sprint 2 — Notifications + bug hunt ✅ SHIPPED

**A. Expiration notifications (in-app, 7/3/1 days)** — ✅
- Edge function `check-expirations` deployed. Scans `invitations` for `coaching_end_date` matching today + {7, 3, 1} days and inserts `notifications` for both coach and client with type `expiration_warning`. Idempotent via same-day title/user_id check.
- Scheduled daily 06:15 UTC via `check-expirations-daily` pg_cron job.
- Post-expiry: `Clients.tsx` renders a "Renewal due" badge on rows/cards whose `coaching_end_date` is in the past. Status stays `active`.

**B. Cronometer meals empty state** — ✅
- `FoodLogTable` now shows: *"Cronometer only shares daily totals with coaches — per-meal detail isn't available."*

**C. Check-in reminder email diagnostic** — ✅ investigated
- Cron jobs `checkin-reminder-sunday` (Sun 18:00 UTC) and `checkin-reminder-monday` (Mon 09:00 UTC) are firing successfully every week.
- Function has proper token-refresh logic. Root cause of missing reminders: coach Gmail OAuth refresh tokens can silently expire/revoke — both coach connections currently have expired access tokens. Recommend surfacing a "reconnect Gmail" prompt in the coach UI when `token_expires_at` is in the past AND refresh fails. Deferred to a small follow-up.

**D. Template edit error** — 🔵 friendlier toast shipped; still awaiting the exact account/plan used in the video repro.


---

### Sprint 3 — Nutrition plan templates + onboarding formulas ✅ SHIPPED

**A. `nutrition_plan_templates` table** — ✅
Columns: `coach_id, name, goal_type ('cut'|'bulk'|'maintain'), target_kcal, protein_g, carbs_g, fat_g, pdf_path, pdf_name, notes`. RLS scopes rows to `coach_id = auth.uid()`. Private storage bucket `nutrition-templates` with per-coach folder policies.

**B. Coach page `NutritionTemplates.tsx`** — ✅
Route `/nutrition-templates` + sidebar link. List / create / edit / delete templates with PDF upload and manual macro targets.

**C. Auto-match after onboarding** — ✅
New `NutritionTemplateSuggestion` component embedded in `ClientProfile` nutrition tab. Reads client's target macros from `nutrition_plans.details` + active goal, ranks coach's templates by normalized Euclidean distance (goal-filtered when possible), shows top 3. "Attach" copies the PDF into the client's `nutrition-documents` bucket and inserts a `client_nutrition_documents` row — never auto-attaches.

**D. Water + supplement facts in onboarding AI** — ✅
`generate-coach-message` now computes and injects into the prompt as authoritative facts:
- `water_ml = round(35 × weight_kg + 500 × weekly_training_hours / 7)`
- Supplement suggestions filtered against the client's current `supplements` field: creatine 5 g/day, whey if protein gap > 30 g, vitamin D3 2000 IU, omega-3 1–2 g, magnesium 200–400 mg.
The model is instructed to phrase them, not invent doses.

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
