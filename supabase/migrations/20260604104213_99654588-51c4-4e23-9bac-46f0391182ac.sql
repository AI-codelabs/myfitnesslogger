-- =========================================================
-- Cronometer sessions: hide credential columns from clients/coaches.
-- =========================================================
REVOKE SELECT ON public.cronometer_sessions FROM authenticated, anon;

GRANT SELECT (
  id,
  client_id,
  cronometer_username,
  user_id_external,
  target_sync_enabled,
  connected_at,
  last_synced_at,
  last_error,
  created_at,
  updated_at
) ON public.cronometer_sessions TO authenticated;

-- Clients need to be able to write their session (INSERT/UPDATE/DELETE)
-- so that the edge-function-driven flow keeps working when run on their behalf.
-- The ALL policy already restricts rows to auth.uid() = client_id.
GRANT INSERT, UPDATE, DELETE ON public.cronometer_sessions TO authenticated;

-- =========================================================
-- MFP sessions: hide raw cookies column from owner reads.
-- =========================================================
REVOKE SELECT ON public.mfp_sessions FROM authenticated, anon;

GRANT SELECT (
  id,
  user_id,
  mfp_username,
  created_at,
  updated_at
) ON public.mfp_sessions TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.mfp_sessions TO authenticated;

-- =========================================================
-- user_roles: defense-in-depth — strip write privileges
-- from authenticated/anon. Role assignment is handled by
-- the SECURITY DEFINER handle_new_user trigger only.
-- =========================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_roles FROM authenticated, anon;