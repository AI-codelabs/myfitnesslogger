-- Historical weekly check-ins (including rows copied during the Neon migration)
-- never fired weekly_checkin_create_drafts, so coaches see "Nog geen reviews"
-- while check-ins exist. Backfill missing drafts and expose ensure_* for runtime.

INSERT INTO public.weekly_review_drafts (coach_id, client_id, week_start, checkin_id)
SELECT DISTINCT inv.coach_id, c.client_id, c.week_start, c.id
FROM public.weekly_checkins c
JOIN public.invitations inv
  ON inv.accepted_user_id = c.client_id
 AND inv.status IN ('onboarding', 'active', 'accepted', 'inactive')
WHERE c.submitted_at IS NOT NULL
ON CONFLICT (coach_id, client_id, week_start) DO UPDATE
  SET checkin_id = COALESCE(public.weekly_review_drafts.checkin_id, EXCLUDED.checkin_id);

CREATE OR REPLACE FUNCTION public.ensure_weekly_review_drafts(_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  coach uuid := auth.uid();
  inserted integer := 0;
BEGIN
  IF coach IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_coach_of(coach, _client_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.weekly_review_drafts (coach_id, client_id, week_start, checkin_id)
  SELECT coach, c.client_id, c.week_start, c.id
  FROM public.weekly_checkins c
  WHERE c.client_id = _client_id
    AND c.submitted_at IS NOT NULL
  ON CONFLICT (coach_id, client_id, week_start) DO UPDATE
    SET checkin_id = COALESCE(public.weekly_review_drafts.checkin_id, EXCLUDED.checkin_id);

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_weekly_review_drafts(uuid) TO authenticated;
