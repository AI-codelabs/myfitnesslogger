
CREATE POLICY "Client can view own web session"
  ON public.cronometer_web_sessions FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Client can insert own web session"
  ON public.cronometer_web_sessions FOR INSERT
  TO authenticated
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "Client can update own web session"
  ON public.cronometer_web_sessions FOR UPDATE
  TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "Client can delete own web session"
  ON public.cronometer_web_sessions FOR DELETE
  TO authenticated
  USING (client_id = auth.uid());
