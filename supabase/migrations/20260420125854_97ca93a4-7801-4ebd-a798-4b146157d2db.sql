CREATE OR REPLACE FUNCTION public.get_clients_last_active(_coach_id uuid)
RETURNS TABLE(user_id uuid, last_sign_in_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id, u.last_sign_in_at
  FROM auth.users u
  WHERE u.id IN (
    SELECT accepted_user_id
    FROM public.invitations
    WHERE coach_id = _coach_id
      AND accepted_user_id IS NOT NULL
  )
    AND _coach_id = auth.uid();
$function$;