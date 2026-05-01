# Coach Dashboard Redesign — 4 Block Layout

Replace the current coach dashboard (3 placeholder "coming soon" cards + Notifications) with 4 focused, data-driven blocks tailored to the daily coaching workflow.

## Layout

```text
+---------------------------+---------------------------+
| 1. Action Required        | 2. Client Risk & Attention|
|    (operational)          |    (intervention moments) |
+---------------------------+---------------------------+
| 3. Recent Activity        | 4. Overview               |
|    (context)              |    (business stats)       |
+---------------------------+---------------------------+
```
Stacks to single column on mobile.

## Block details

### 1. Action Required
- New check-ins this week (not yet reviewed by coach → no published `weekly_review_drafts`)
- Missed check-ins (active client, no `weekly_checkins` row for current `week_start`)
- Open onboarding (client completed onboarding, coach hasn't published start message)
- Pending invitations (status `pending`)
- Each item: client name + tag + link to relevant page

### 2. Client Risk & Attention (NEW — the win)
Detection runs over the last 1–2 check-ins per client:
- **Low motivation/energy**: latest `feeling`, `energy`, or `progression` ≤ 2 (scale 1–5)
- **Poor compliance**: latest `nutrition_stars` ≤ 2 or `supplements_consistency` ≤ 2
- **Negative tone**: keyword scan over `obstacles`, `progress_feeling`, `cravings`, `other_notes` for words like: moeilijk, zwaar, opgeven, gestopt, demotivated, struggling, gave up, frustrated, can't, niet meer
- **Goal mismatch**: weight delta moves opposite to `primary_goal` (e.g. weight ↑ while goal is `lose_weight`/`afvallen`) — compares last 2 check-ins
- **Multiple missed actions**: 2+ consecutive weeks without check-in
- Each row shows: client name, risk badge(s), one-line reason, link to client profile checkins tab
- Sorted by severity (negative tone + low motivation first)

### 3. Recent Activity (replaces planning placeholder)
Unified, time-sorted feed (last 7 days, max 8 items):
- Latest check-in submissions (`weekly_checkins.submitted_at`)
- Latest client coach messages activity (`coach_messages.published_at`)
- New onboarding completions (`onboarding_responses.completed_at`)
- Each item: icon, client name, action verb, relative time, click → relevant page

### 4. Overview (business stats)
Compact stat tiles inside the card:
- Active clients (invitations status active/accepted with completed onboarding)
- New this week (invitations.accepted_at within last 7 days)
- Onboarding in progress
- Check-in completion rate this week (% of active clients submitted)

## Technical implementation

**New files:**
- `src/components/coach-dashboard/ActionRequiredBlock.tsx`
- `src/components/coach-dashboard/RiskAttentionBlock.tsx`
- `src/components/coach-dashboard/RecentActivityBlock.tsx`
- `src/components/coach-dashboard/OverviewStatsBlock.tsx`
- `src/lib/coachDashboard.ts` — shared loader: fetches clients, recent check-ins (last 2 per client), onboarding, messages, invitations once; derives risks via pure helpers (`detectRisks`, `negativeToneScore`, `goalConflict`).

**Modified:**
- `src/pages/Index.tsx` — coach branch only: replace the 3 placeholder cards + DashboardNotifications with a 2-column grid hosting the 4 blocks. Keep notifications accessible via the topbar bell. Client dashboard untouched.

**Data fetching strategy:**
- One shared hook `useCoachDashboardData()` issues parallel queries (invitations → clientIds → checkins/onboarding/messages/reviews) similar to `CoachTasks.tsx`. Each block consumes the same dataset to avoid duplicate requests.
- Loading state: skeletons per block.
- Empty states per block with friendly copy in NL (matches existing tone).

**Risk detection helpers (pure, testable):**
```ts
detectRisks(checkins: Checkin[], onboarding: OnboardingResponse) => Risk[]
// Risk = { type: 'low_motivation'|'poor_compliance'|'negative_tone'|'goal_mismatch'|'missed_streak', reason: string, severity: 1|2|3 }
```
Negative-tone keywords stored as NL+EN list constant.

**Design:**
- Reuse existing `Card`, `Badge`, semantic tokens
- Risk block uses `border-l-4 border-amber-500` accent on attention rows; severe items get `border-destructive`
- Icon per block (Flame, AlertTriangle, MessageSquare, BarChart3) in colored chip header matching existing style on Index

**Out of scope:** persistent risk dismissal, client-side dashboard changes, notification system changes.

Approve to implement.