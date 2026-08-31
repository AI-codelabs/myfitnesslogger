# Coaching Platform

Mobile-first coaching product for coaches and clients. Coaches manage clients, workouts, nutrition templates, and tasks; clients use a personal portal for training, nutrition, and progression.

## Quick start

```bash
cp .env.example .env.local
# Fill DATABASE_URL + Neon Auth URLs from the Neon console (see docs/ARCHITECTURE.md)
npm install --legacy-peer-deps
npm run dev
```

For API routes locally, use `vercel dev` (or deploy a Preview) so `/api/*` resolves.

## Stack

- **App:** Vite + React + TypeScript
- **UI:** Untitled UI (primary); legacy shadcn during migration
- **DB:** Neon Postgres
- **Auth:** Neon Auth (Managed Better Auth)
- **Host:** Vercel (`api/` serverless + Blob + crons)

Architecture details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)  
Deploy checklist: [`DEPLOY_VERCEL.md`](DEPLOY_VERCEL.md)  
Migration notes: [`MIGRATION_HANDOVER.md`](MIGRATION_HANDOVER.md)

## Project rules (Cursor)

Rules under `.cursor/rules/` are always applied:

- `mobile-first.mdc` — every screen designed for phone, verified on desktop
- `untitled-ui.mdc` — Untitled UI as the primary component library
- `stack-and-architecture.mdc` — roles, pages, data access conventions
- `vercel-neon.mdc` — Neon + Vercel + secrets

## Neon foundation

Project **`coaching-platform`** (`fragrant-queen-24129188`, `aws-eu-central-1`) is provisioned with Neon Auth enabled and foundation schema applied from `db/migrations/20260831_foundation.sql`.

```bash
npm run db:apply-foundation
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run db:apply-foundation` | Apply foundation SQL to `DATABASE_URL` |
