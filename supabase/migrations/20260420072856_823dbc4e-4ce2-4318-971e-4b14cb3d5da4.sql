-- 1. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. Trigger: when a new auth user is created, auto-accept any pending invite for their email
--    and notify the inviting coach.
CREATE OR REPLACE FUNCTION public.handle_invitation_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  FOR inv IN
    SELECT id, coach_id, email
    FROM public.invitations
    WHERE lower(email) = lower(NEW.email)
      AND status = 'pending'
  LOOP
    UPDATE public.invitations
    SET status = 'accepted',
        accepted_at = now(),
        accepted_user_id = NEW.id
    WHERE id = inv.id;

    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      inv.coach_id,
      'invite_accepted',
      'Client joined',
      inv.email || ' accepted your invitation.',
      '/'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_accept_invite ON auth.users;
CREATE TRIGGER on_auth_user_created_accept_invite
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invitation_on_signup();

-- 3. Backfill: thobias already signed up but invite is still pending
UPDATE public.invitations i
SET status = 'accepted',
    accepted_at = COALESCE(i.accepted_at, u.created_at),
    accepted_user_id = u.id
FROM auth.users u
WHERE lower(u.email) = lower(i.email)
  AND i.status = 'pending';

-- And create a notification for that backfilled acceptance (only if not already)
INSERT INTO public.notifications (user_id, type, title, body, link)
SELECT i.coach_id, 'invite_accepted', 'Client joined',
       i.email || ' accepted your invitation.', '/'
FROM public.invitations i
WHERE i.status = 'accepted'
  AND i.accepted_at >= now() - interval '1 day'
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = i.coach_id
      AND n.type = 'invite_accepted'
      AND n.body LIKE i.email || '%'
  );