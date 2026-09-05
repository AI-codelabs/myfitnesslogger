# Technical architecture — Coaching Platform

## Purpose

A coaching platform that lets coaches manage clients with minimal admin. Automation removes repetitive work so coaches focus on clients. Clients get a personal portal optimized for mobile web.

## Roles & surfaces

| Role | Identity | Primary surfaces |
| --- | --- | --- |
| Coach | `app_role = coach` | Dashboard, Clients, Workouts, Nutrition templates, Tasks, Configuration |
| Client | `app_role = user` | Dashboard, Training, Nutrition, Progression |

Coaches invite clients by email (`invitations` → acceptance → coach/client link). Each client works inside their own workspace; coaches see client-scoped data through RLS (`is_coach_of`, invitation acceptance, `coach_client_links`).

## High-level system

```text
┌─────────────────────────────┐
│  Vite React SPA (mobile-first) │
│  Untitled UI → (legacy shadcn) │
│  React Query + React Router    │
└──────────────┬──────────────┘
               │ JWT (Neon Auth)
               ▼
┌─────────────────────────────┐     ┌──────────────────────┐
│  Vercel Serverless `api/`   │────▶│  Neon Postgres        │
│  /api/pg/query, rpc, domain │     │  RLS + auth.users     │
│  cron, email, AI, blob URLs │     │  neon_auth.* (Auth)   │
└──────────────┬──────────────┘     └──────────────────────┘
               │
               ▼
        Vercel Blob (files)
```

## Stack choices

| Concern | Choice | Why |
| --- | --- | --- |
| Frontend | Vite + React + TS | Existing app; fast local DX |
| UI kit | Untitled UI (primary) | Design-system consistency; mobile-friendly primitives |
| Hosting | Vercel | SPA + serverless + Blob + crons in one place |
| Database | Neon Postgres | Branchable serverless Postgres from day one |
| Auth | Neon Auth (Managed Better Auth) | Preferred; may be wired fully after first deploy |
| Access path | `/api/pg/*` + RLS impersonation | Keeps policies in Postgres; no PostgREST dependency |

## Neon project (foundation)

| Field | Value |
| --- | --- |
| Name | `coaching-platform` |
| Project ID | `fragrant-queen-24129188` |
| Region | `aws-eu-central-1` |
| Postgres | 17 |
| Default branch | `main` (`br-nameless-unit-b1jeijpa`) |
| Endpoint | `ep-winter-sky-b1m35c4c` |
| Auth base URL | `https://ep-winter-sky-b1m35c4c.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth` |

Foundation schema: `db/migrations/20260831_foundation.sql`  
(`auth.users` compatibility, `profiles`, `user_roles`, `invitations`, `coach_client_links`, helpers).

Historical / richer domain schema still lives under `supabase/migrations/` and the prior Neon production project documented in `MIGRATION_HANDOVER.md`. Cutover to this Neon project is an explicit ops step (env swap + schema sync), not automatic.

## Auth model

1. Browser signs up / signs in via Neon Auth (`VITE_NEON_AUTH_URL`).
2. API verifies JWT (`NEON_AUTH_JWKS_URL` / issuer).
3. `withUser` upserts `auth.users` + profile/role rows, then sets `request.jwt.claims` so `auth.uid()` and RLS apply.
4. App roles are **not** custom JWT claims — they live in `public.user_roles` and are bootstrapped after signup (`/api/auth/bootstrap`).

Neon Auth trusted domains configured: `http://localhost:5173`, `https://myfitnesslogger.vercel.app`.

## Frontend routing map

Coach: `/`, `/clients`, `/workouts`, `/nutrition-templates`, `/tasks`, `/settings`  
Client: `/`, `/training`, `/nutrition`, `/progression` (+ check-in / meal-plan helpers)

Shared: auth pages, `/account`, onboarding for clients.

## UI strategy

- **Mobile-first** enforced by `.cursor/rules/mobile-first.mdc`.
- **Untitled UI** is the primary component library going forward (`.cursor/rules/untitled-ui.mdc`).
- Existing Radix/shadcn under `src/components/ui/` remains until screens are migrated. A full Untitled UI CLI `init` implies Tailwind v4 — treat that as a dedicated upgrade, not a drive-by change.

## Deployment

- Local: `npm run dev` (Vite) + Vercel CLI or `vercel dev` when exercising `/api`.
- Production: Vercel project `myfitnesslogger` — see `DEPLOY_VERCEL.md` and `vercel.json`.
- Env template: `.env.example`. Secrets: `.env.local` (gitignored) and Vercel dashboard.

## Near-term build order

1. Point Preview/local env at `coaching-platform` Neon + Auth URLs.
2. Apply remaining domain migrations onto this Neon project (or sync from prior Neon).
3. Finish Neon Auth cutover (email provider, trusted prod domain already listed).
4. Adopt Untitled UI on new client mobile screens first.
5. Retire legacy Supabase client / storage fallbacks when unused.
