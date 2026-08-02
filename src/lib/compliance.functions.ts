import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Chave lógica do checklist — permite outros checklists na mesma tabela no futuro. */
export const DECRETO_10278_KEY = "decreto_10278";

export type ChecklistStatusValue = "pendente" | "conforme" | "nao_aplicavel";

export interface ChecklistStateResult {
  orgId: string | null;
  statuses: Record<string, ChecklistStatusValue>;
}

const statusSchema = z.enum(["pendente", "conforme", "nao_aplicavel"]);

const saveSchema = z.object({
  itemId: z.string().min(1).max(64),
  status: statusSchema,
});

/**
 * Resolve a organização corrente do usuário autenticado.
 * Retorna null quando o usuário ainda não pertence a nenhuma organização.
 */
async function resolveOrgId(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.current_org_id) return profile.current_org_id as string;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return (membership?.org_id as string | undefined) ?? null;
}

/** Lê o checklist persistido da organização corrente. */
export const getChecklistState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChecklistStateResult> => {
    const db = supabase as unknown as { from: (t: string) => any };
    const orgId = await resolveOrgId(db, userId);
    if (!orgId) return { orgId: null, statuses: {} };

    const { data, error } = await db
      .from("compliance_checklist_status")
      .select("item_id, status")
      .eq("org_id", orgId)
      .eq("checklist_key", DECRETO_10278_KEY);

    if (error) throw new Error(error.message);

    const statuses: Record<string, ChecklistStatusValue> = {};
    for (const row of (data ?? []) as Array<{ item_id: string; status: string }>) {
      const parsed = statusSchema.safeParse(row.status);
      if (parsed.success) statuses[row.item_id] = parsed.data;
    }
    return { orgId, statuses };
  });

/** Persiste (upsert) o status de um item do checklist para a organização corrente. */
export const saveChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const db = supabase as unknown as { from: (t: string) => any };
    const orgId = await resolveOrgId(db, userId);
    if (!orgId) throw new Error("Usuário sem organização ativa.");

    const { error } = await db.from("compliance_checklist_status").upsert(
      {
        org_id: orgId,
        checklist_key: DECRETO_10278_KEY,
        item_id: data.itemId,
        status: data.status,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,checklist_key,item_id" },
    );

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Reinicia o checklist da organização, removendo todos os status persistidos. */
export const resetChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const db = supabase as unknown as { from: (t: string) => any };
    const orgId = await resolveOrgId(db, userId);
    if (!orgId) return { ok: true };

    const { error } = await db
      .from("compliance_checklist_status")
      .delete()
      .eq("org_id", orgId)
      .eq("checklist_key", DECRETO_10278_KEY);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
