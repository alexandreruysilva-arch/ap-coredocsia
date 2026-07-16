-- Corrige get_audit_stats para filtrar/agrupar por company_id e document_type_id
-- em vez do nome (denormalizado em ai_usage_logs), que se torna incorreto
-- quando uma empresa ou tipo de documento e renomeado depois do log ser gravado.
-- Os nomes retornados agora vem preferencialmente da tabela viva (companies /
-- document_types), caindo para o snapshot histórico só quando o registro de
-- origem já não existe mais.

CREATE OR REPLACE FUNCTION public.get_audit_stats(_org_id uuid, _company_id uuid DEFAULT NULL::uuid, _doc_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_member boolean;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.organization_members
    WHERE org_id = _org_id AND user_id = _uid) INTO _is_member;
  IF NOT _is_member THEN RAISE EXCEPTION 'not a member of org'; END IF;

  WITH base AS (
    SELECT * FROM public.ai_usage_logs
    WHERE org_id = _org_id
      AND (_company_id  IS NULL OR company_id       = _company_id)
      AND (_doc_type_id IS NULL OR document_type_id = _doc_type_id)
  ),
  totals AS (
    SELECT
      count(*)::int AS files,
      count(*) FILTER (WHERE success)::int      AS success,
      count(*) FILTER (WHERE NOT success)::int  AS failed,
      COALESCE(sum(prompt_tokens),0)::bigint     AS prompt,
      COALESCE(sum(completion_tokens),0)::bigint AS completion,
      COALESCE(sum(total_tokens),0)::bigint      AS total,
      COALESCE(sum(cost_brl),0)::numeric         AS cost,
      count(*) FILTER (WHERE duration_ms IS NOT NULL)::int AS duration_count,
      COALESCE(sum(duration_ms),0)::bigint       AS duration_total,
      COALESCE(sum(GREATEST(extracted_chars - COALESCE(corrected_chars,0),0)::numeric
        / NULLIF(extracted_chars,0) * 100), 0)::numeric AS accuracy_sum,
      count(*) FILTER (WHERE extracted_chars > 0)::int AS accuracy_count
    FROM base
  ),
  by_company AS (
    SELECT
      b.company_id AS id,
      COALESCE(c.name, MAX(b.company_name), '—') AS name,
      count(*)::int AS files,
      COALESCE(sum(b.total_tokens),0)::bigint AS tokens,
      COALESCE(sum(b.cost_brl),0)::numeric AS cost
    FROM base b
    LEFT JOIN public.companies c ON c.id = b.company_id
    GROUP BY b.company_id, c.name
    ORDER BY 5 DESC
  ),
  companies AS (
    SELECT DISTINCT ON (l.company_id)
      l.company_id AS id,
      COALESCE(c.name, l.company_name) AS name
    FROM public.ai_usage_logs l
    LEFT JOIN public.companies c ON c.id = l.company_id
    WHERE l.org_id = _org_id AND l.company_id IS NOT NULL
    ORDER BY l.company_id, name
  ),
  doc_types AS (
    SELECT DISTINCT ON (l.document_type_id)
      l.document_type_id AS id,
      COALESCE(dt.name, l.document_type_name) AS name
    FROM public.ai_usage_logs l
    LEFT JOIN public.document_types dt ON dt.id = l.document_type_id
    WHERE l.org_id = _org_id AND l.document_type_id IS NOT NULL
      AND (_company_id IS NULL OR l.company_id = _company_id)
    ORDER BY l.document_type_id, name
  )
  SELECT jsonb_build_object(
    'totals', to_jsonb(t.*),
    'byCompany', COALESCE((SELECT jsonb_agg(row_to_json(by_company)) FROM by_company), '[]'::jsonb),
    'companies', COALESCE((SELECT jsonb_agg(row_to_json(companies) ORDER BY companies.name) FROM companies), '[]'::jsonb),
    'docTypes',  COALESCE((SELECT jsonb_agg(row_to_json(doc_types) ORDER BY doc_types.name) FROM doc_types), '[]'::jsonb)
  ) INTO _result FROM totals t;

  RETURN _result;
END; $function$
