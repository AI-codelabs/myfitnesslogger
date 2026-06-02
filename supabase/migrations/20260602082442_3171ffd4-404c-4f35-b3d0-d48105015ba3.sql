ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS coaching_start_date date,
  ADD COLUMN IF NOT EXISTS coaching_end_date date;