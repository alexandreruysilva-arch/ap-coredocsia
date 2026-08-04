-- Tabela de status do checklist de conformidade (ex.: Decreto 10.278/2020),
-- persistida por organização. checklist_key permite outros checklists na mesma
-- tabela no futuro. Usada por src/lib/compliance.functions.ts
-- (getChecklistState / saveChecklistItem / resetChecklist).

CREATE TABLE IF NOT EXISTS public.compliance_checklist_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  checklist_key text NOT NULL,
  item_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pendente', 'conforme', 'nao_aplicavel')),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, checklist_key, item_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_checklist_org_key
  ON public.compliance_checklist_status (org_id, checklist_key);

ALTER TABLE public.compliance_checklist_status ENABLE ROW LEVEL SECURITY;

-- Isolamento por organização, no mesmo padrão das demais tabelas do projeto
-- (is_org_member / is_platform_admin).
CREATE POLICY "Org members view compliance checklist"
  ON public.compliance_checklist_status
  FOR SELECT
  USING (public.is_org_member(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Org members insert compliance checklist"
  ON public.compliance_checklist_status
  FOR INSERT
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members update compliance checklist"
  ON public.compliance_checklist_status
  FOR UPDATE
  USING (public.is_org_member(auth.uid(), org_id))
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members delete compliance checklist"
  ON public.compliance_checklist_status
  FOR DELETE
  USING (public.is_org_member(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));
