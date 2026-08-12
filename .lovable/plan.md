# Migrate from Lovable Cloud to Neon

## Goal
Move the entire application and all current data from Lovable Cloud (Supabase) to a self-managed Neon Postgres database, so the user owns the backend and can connect other tools to it. The migration should be as close to 1:1 as possible and not disrupt existing coaches or clients.

## What this actually involves
The current project is not just a database. It depends on Lovable Cloud for:
- Postgres database (tables, RLS, triggers, functions)
- Authentication (Supabase Auth, users, sessions, roles)
- File storage (progress photos, nutrition documents, onboarding uploads)
- Edge functions (Cronometer integration, email, weekly reviews, etc.)

Moving to Neon means we must also replace or re-host those three non-database services. A “database-only” migration will break login, file uploads, and background jobs.

## Phase 1 — Neon account and project
1. Create a Neon project in the user’s account (or have the user create it and share the connection string).
2. Choose the region closest to current users (e.g., Amsterdam / Frankfurt for EU customers).
3. Configure the database role and password. Save the connection string as a secret in the project.

## Phase 2 — Schema migration
1. Extract the full schema of the `public` schema from the current database (tables, enums, indexes, triggers, functions, extensions).
2. Clean / adapt it for Neon:
   - Keep all tables, columns, enums, indexes, and triggers used by the app.
   - Remove or replace Supabase-only helpers that are no longer available.
3. Apply the schema to the Neon database.
4. Verify the two schemas match structurally.

## Phase 3 — Data migration
1. Export all rows from the current `public` tables.
2. Disable triggers that send notifications or call external services during the initial import.
3. Import data into Neon in the correct order (respecting foreign keys).
4. Re-enable triggers.
5. Reconcile sequences (e.g., `gen_random_uuid()` and any serial/sequence state).

## Phase 4 — Replace auth, storage, and functions
- **Auth:** Replace Supabase Auth with an alternative such as Auth.js / NextAuth or a custom JWT-based solution. This requires building or configuring sign-up, login, password reset, email verification, and role checks.
- **Storage:** Replace Supabase Storage buckets with an S3-compatible object store (AWS S3, Cloudflare R2, or Tigris). Update all file upload/download paths and migrate existing files.
- **Edge functions:** Migrate the functions under `supabase/functions/` to a different serverless host (Vercel Functions, Cloudflare Workers, or a small Node/Deno server). Update the frontend to call the new endpoints.

## Phase 5 — Application configuration and testing
1. Update the app to connect to Neon instead of Supabase (e.g., via a Postgres client or an ORM).
2. Replace all Supabase client queries and RLS logic with server-side checks or a new access layer.
3. Run end-to-end tests on a staging branch connected to the new backend.
4. Migrate remaining storage files and sync the final incremental data changes.

## Phase 6 — Cutover
1. Put the app in read-only mode briefly to prevent new writes.
2. Sync the final delta of data.
3. Update production environment variables to point at Neon and the new auth/storage/function endpoints.
4. Deploy the refactored app.
5. Smoke-test login, check-in submission, file uploads, and Cronometer sync.

## What I need from you now
To start Phase 1, choose one of these options:

**Option A — I create the Neon project for you**
- Create a Neon account and generate a personal API key with permission to create projects.
- Add the API key as a secret in the project (I will tell you the secret name).
- Tell me your preferred region and project name.

**Option B — You create the project and share the connection string**
- Create the Neon project yourself and run `CREATE DATABASE` or use the default database.
- Add the connection string as a secret (or share it securely in chat).
- I will handle the schema and data migration.

Also confirm:
- Do you want me to propose and set up a replacement for auth/storage/functions, or will you handle those separately?
- Which region should the Neon database be in?
- Do you want to keep the existing app on Lovable as the frontend host, or do you also plan to move hosting elsewhere?
