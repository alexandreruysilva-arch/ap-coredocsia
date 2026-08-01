-- Adiciona colunas para conformidade com o Decreto 10.278/2020
ALTER TABLE public.document_types ADD COLUMN IF NOT EXISTS decreto_compliant BOOLEAN DEFAULT FALSE;
ALTER TABLE public.document_types ADD COLUMN IF NOT EXISTS compliance_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.document_types.decreto_compliant IS 'Indica se este tipo de documento segue o fluxo do Decreto 10.278/2020';
COMMENT ON COLUMN public.document_types.compliance_config IS 'Configurações detalhadas de conformidade (metadados, prazos, etc)';

-- Atualiza permissões para garantir que o service_role possa gerenciar estas colunas
GRANT UPDATE(decreto_compliant, compliance_config) ON public.document_types TO authenticated;
