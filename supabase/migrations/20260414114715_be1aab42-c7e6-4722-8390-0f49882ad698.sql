
-- Table to store MFP session cookies for each user
CREATE TABLE public.mfp_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  mfp_username TEXT,
  cookies TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.mfp_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own MFP session
CREATE POLICY "Users can view their own MFP session" ON public.mfp_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own MFP session" ON public.mfp_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own MFP session" ON public.mfp_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own MFP session" ON public.mfp_sessions FOR DELETE USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_mfp_sessions_updated_at
BEFORE UPDATE ON public.mfp_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
