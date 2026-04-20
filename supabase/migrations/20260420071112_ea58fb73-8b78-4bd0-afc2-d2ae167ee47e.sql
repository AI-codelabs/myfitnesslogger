DROP POLICY IF EXISTS "Invitees can view invitations to their email" ON public.invitations;

CREATE POLICY "Invitees can view invitations to their email"
ON public.invitations
FOR SELECT
TO authenticated
USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));