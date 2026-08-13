-- Harden get_active_client_goal: SECURITY DEFINER must still enforce that the
-- caller is the client or their coach. Without this, /api/pg/rpc is an IDOR.
CREATE OR REPLACE FUNCTION public.get_active_client_goal(_client_id uuid)
RETURNS public.client_goals
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM public.client_goals
  WHERE client_id = _client_id
    AND is_active = true
    AND (
      client_id = auth.uid()
      OR public.is_coach_of(auth.uid(), _client_id)
    )
  ORDER BY created_at DESC
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_client_goal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_client_goal(uuid) TO authenticated, service_role;
