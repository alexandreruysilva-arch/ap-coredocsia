import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const complianceConfigSchema = z.object({
  document_type_id: z.string().uuid(),
  decreto_compliant: z.boolean(),
  metadata_mapping: z.record(z.string()).optional(),
  quality_check_required: z.boolean().default(true),
  preservation_period_years: z.number().int().default(5),
});

export const getComplianceConfig = createServerFn({ method: "GET" })
  .inputValidator((data) => z.string().uuid().parse(data))
  .handler(async ({ data: typeId }) => {
    const { data, error } = await supabaseAdmin
      .from("document_types")
      .select("decreto_compliant, compliance_config")
      .eq("id", typeId)
      .single();

    if (error) throw error;
    return data;
  });

export const updateComplianceConfig = createServerFn({ method: "POST" })
  .inputValidator((data) => complianceConfigSchema.parse(data))
  .handler(async ({ data }) => {
    const { document_type_id, decreto_compliant, ...config } = data;
    const { error } = await supabaseAdmin
      .from("document_types")
      .update({
        decreto_compliant,
        compliance_config: config
      })
      .eq("id", document_type_id);

    if (error) throw error;
    return { success: true };
  });
