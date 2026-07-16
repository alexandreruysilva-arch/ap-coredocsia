
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_grok_model text NOT NULL DEFAULT 'grok-build-0.1',
  ADD COLUMN IF NOT EXISTS ai_openai_model text NOT NULL DEFAULT 'gpt-5.4-mini';
