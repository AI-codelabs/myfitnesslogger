DROP POLICY IF EXISTS "Coaches can view client check-ins" ON public.weekly_checkins;
CREATE POLICY "Coaches can view client check-ins"
ON public.weekly_checkins
FOR SELECT
TO authenticated
USING (public.is_coach_of(auth.uid(), client_id));