CREATE TABLE public.coach_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  client_id UUID NOT NULL UNIQUE,
  voice_memo TEXT NOT NULL DEFAULT '',
  client_positive TEXT[] NOT NULL DEFAULT '{}',
  client_attention TEXT[] NOT NULL DEFAULT '{}',
  client_actions TEXT[] NOT NULL DEFAULT '{}',
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages messages for their clients"
ON public.coach_messages
FOR ALL
TO authenticated
USING (auth.uid() = coach_id AND public.is_coach_of(auth.uid(), client_id))
WITH CHECK (auth.uid() = coach_id AND public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Client views own message"
ON public.coach_messages
FOR SELECT
TO authenticated
USING (auth.uid() = client_id AND published_at IS NOT NULL);

CREATE TRIGGER set_coach_messages_updated_at
BEFORE UPDATE ON public.coach_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_coach_messages_client ON public.coach_messages(client_id);
CREATE INDEX idx_coach_messages_coach ON public.coach_messages(coach_id);