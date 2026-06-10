REVOKE EXECUTE ON FUNCTION public.get_active_client_goal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_client_goal(uuid) TO authenticated, service_role;