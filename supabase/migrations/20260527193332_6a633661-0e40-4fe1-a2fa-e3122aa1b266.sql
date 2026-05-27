
-- 1. coach_email_connections: revoke SELECT on sensitive token columns from client roles
REVOKE SELECT (refresh_token, access_token, token_expires_at, scope)
  ON public.coach_email_connections FROM authenticated;
REVOKE SELECT (refresh_token, access_token, token_expires_at, scope)
  ON public.coach_email_connections FROM anon;

-- 2. cronometer_sessions: revoke SELECT on raw session credential columns from client roles
REVOKE SELECT (cookies, gwt_header, gwt_permutation)
  ON public.cronometer_sessions FROM authenticated;
REVOKE SELECT (cookies, gwt_header, gwt_permutation)
  ON public.cronometer_sessions FROM anon;

-- 3. email-assets bucket: remove broad SELECT policy that allowed listing.
-- Direct public URLs still work because the bucket itself is marked public.
DROP POLICY IF EXISTS "Email assets public read" ON storage.objects;
