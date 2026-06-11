CREATE UNIQUE INDEX idx_invitations_coach_email_unique
ON public.invitations (coach_id, email)
WHERE status IN ('pending', 'onboarding', 'active', 'accepted', 'inactive');