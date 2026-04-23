
CREATE OR REPLACE FUNCTION public.handle_weekly_checkin_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv RECORD;
  client_name text;
BEGIN
  SELECT COALESCE(p.display_name, u.email) INTO client_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = NEW.client_id;

  FOR inv IN
    SELECT DISTINCT coach_id
    FROM public.invitations
    WHERE accepted_user_id = NEW.client_id
      AND status IN ('onboarding', 'active', 'accepted', 'inactive')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      inv.coach_id,
      'weekly_checkin_submitted',
      'Weekly check-in submitted',
      COALESCE(client_name, 'A client') || ' submitted their weekly check-in.',
      '/clients/' || NEW.client_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_weekly_checkin_insert ON public.weekly_checkins;
CREATE TRIGGER on_weekly_checkin_insert
AFTER INSERT ON public.weekly_checkins
FOR EACH ROW
EXECUTE FUNCTION public.handle_weekly_checkin_notify();
