## Client/Coach feedback — triage & rollout plan

Grouped from **quick wins** → **medium** → **larger builds**. Items marked ❓ need clarification before I start.

---

### Tier 1 — Quick wins (small, isolated changes)

1. **Onboarding summary: stop repeating client stats**
   Tweak the AI prompt in `generate-coach-message` / onboarding summary flow to omit height/weight recital.

2. **Body weight required in weekly check-in**
   Mark weight field with `*`, add zod validation, block submit until filled. File: `src/pages/WeeklyCheckin.tsx` + `lib/weeklyCheckin.ts`.

3. **Show completed onboarding as read-only view**
   Already have `ClientProfile.tsx` render via `onboardingSchema`. Add a "View my intake" entry point for the *client* themselves (Account/Settings page) and/or a modal from the dashboard after completion.

4. **Auto-mark voice memo complete on publish**
   In `WeeklyReviewTab` / publish handler: when bullets published, also flip the voice-memo `completed` flag in the same update.

5. **Voice memo: name the 2 non-progressing exercises**
   Update `generate-weekly-review` prompt + data extraction to pass exercise names for the "no progress" set, not just counts.

---

### Tier 2 — Medium (bug fixes + notification wiring)

6. **Error when editing a template** ❓
   Need repro details — which template (workout plan? nutrition plan? email template?), what action triggers the error, and the exact error text/console output.

7. **Check-in reminder email not received** ❓
   `send-checkin-reminders` exists. Need to check: is the cron job actually scheduled? Is the coach's email in `coach_email_connections`? I'll audit `email_send_log` and cron schedule. May just be a wiring bug.

8. **Expiration date notifications**
   Design: add a scheduled job that runs daily; 7 days + 1 day before invitation `expires_at`, insert a `notifications` row for the coach (+ optionally email). After expiry: keep client active but flag with a "Renewal due" badge on `Clients.tsx` and dashboard. ❓ Confirm: (a) how many days before to warn (7/3/1?), (b) email + in-app or in-app only, (c) after expiry — auto-mark `inactive` or keep `active` with badge?

9. **Yannick — Cronometer meals empty**
   Already known: Cronometer Pro API only returns daily totals, no per-meal breakdown. Options were discussed. Need to decide: live with daily totals + surface a clearer empty-state message ("Cronometer shows totals only — per-meal detail unavailable"), or revisit SPA scrape. ❓

---

### Tier 3 — Larger builds (new features)

10. **Nutrition plan templates + auto-match after onboarding**
    New feature. Scope:
    - New table `nutrition_plan_templates` (coach_id, name, goal_type `cut`/`bulk`/`maintain`, target_kcal, protein_g, carbs_g, fat_g, pdf storage path)
    - Coach uploads PDFs + fills macro targets (new page: `NutritionTemplates.tsx`)
    - After onboarding completes, compute the client's target macros (already partially in `cronometerTargets.ts`) and rank templates by Euclidean distance on macros, filtered by `goal_type`
    - Suggest top match in coach dashboard "Action required" block; coach can accept → auto-attach PDF via existing `client_nutrition_documents` flow
    ❓ Confirm: (a) coach fills macro targets manually per template, or should AI parse them from the PDF? (b) auto-attach on match or always require coach approval?

11. **Supplement + water formula in onboarding AI**
    Replace ad-hoc AI guesses with deterministic formulas, then let AI phrase them:
    - Water: `35 ml × body weight (kg)` (adjust +500 ml per training hour) — confirm formula ❓
    - Supplements: rules-based recommendations (creatine 5g/day, whey based on protein gap, vitamin D if low sun exposure, omega-3, magnesium) — need your preferred rule set ❓
    Implement in `generate-coach-message` (or wherever onboarding summary is generated): compute values in code, inject into the prompt as facts.

12. **Strength-progress graph over time**
    New chart in `ClientProgressionTab` / `Progression.tsx`: per-exercise line chart of top-set estimated 1RM (Epley: `weight × (1 + reps/30)`) or heaviest working set over the last N weeks. Data source: `workout_set_logs`. ❓ Confirm: per-exercise selector, or a summary "strength index" across compound lifts (squat/bench/DL/OHP)?

13. **Step counter integration**
    Large. Options:
    - **Apple Health / Google Fit**: requires native wrapper (Capacitor). Currently the app is a web PWA — this is a multi-week build.
    - **Manual daily step entry**: quick — add a field alongside `DailyWeightLogger`.
    - **Fitbit/Garmin OAuth**: per-provider integration.
    ❓ Which route? I'd recommend starting with manual entry + a Fitbit OAuth (similar pattern to Cronometer) if native isn't on the table.

---

### Proposed execution order

**Sprint 1 (this week):** Items 1, 2, 3, 4, 5 — all small, no clarifications needed. Ship together.
**Sprint 2:** Item 7 (diagnose reminder email), Item 6 (template edit bug — once repro provided), Item 8 (expiration notifications).
**Sprint 3:** Item 10 (nutrition templates) + Item 11 (formulas).
**Sprint 4:** Item 12 (strength graph).
**Backlog:** Item 9 (Cronometer meals — awaiting decision), Item 13 (steps — awaiting scope decision).

---

### Clarifications I need before starting the blocked items

1. **Template edit error** — which section (workout / nutrition / email), reproduction steps, screenshot or error text?
2. **Expiration notifications** — warning cadence (7/3/1 days?), email + in-app or just in-app, and post-expiry behavior (auto-inactivate or keep active + badge)?
3. **Cronometer meals** — accept "daily totals only" as final and improve empty state, or revisit scraping?
4. **Nutrition templates** — AI-parse macros from PDF, or coach enters them manually? Auto-attach best match or always coach-approve?
5. **Water/supplement formulas** — confirm the formulas you want (I proposed `35 ml/kg + 500 ml/training hour`; supplement rule set is open).
6. **Strength graph** — per-exercise picker vs. compound "strength index" summary?
7. **Step counter** — native (Capacitor), manual entry, or third-party OAuth (Fitbit/Garmin)?

Reply with answers to any subset and I'll start Sprint 1 immediately in parallel.