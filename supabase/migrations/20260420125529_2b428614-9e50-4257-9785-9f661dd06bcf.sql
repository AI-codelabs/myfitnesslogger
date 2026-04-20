CREATE OR REPLACE FUNCTION public.is_coach_of(_coach_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.invitations
    WHERE coach_id = _coach_id
      AND accepted_user_id = _client_id
      AND status IN ('onboarding', 'active', 'accepted', 'inactive')
  );
$function$;