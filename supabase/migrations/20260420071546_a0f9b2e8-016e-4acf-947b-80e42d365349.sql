CREATE POLICY "Coaches can delete their own invitations"
ON public.invitations
FOR DELETE
TO authenticated
USING (auth.uid() = coach_id);