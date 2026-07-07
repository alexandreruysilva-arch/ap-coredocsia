import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DocStatus, DocumentRow } from "@/lib/documents";

export interface ListDocumentsParams {
  orgId: string | null | undefined;
  status?: DocStatus | "all";
  typeId?: string | "all";
  search?: string;
  includeDeleted?: boolean;
  allowedTypeIds?: string[] | null;
}

export function useDocumentsList(params: ListDocumentsParams) {
  const queryClient = useQueryClient();
  const {
    orgId,
    status = "all",
    typeId = "all",
    search = "",
    includeDeleted = false,
    allowedTypeIds = null,
  } = params;

  const query = useQuery({
    queryKey: ["documents", orgId, status, typeId, search, includeDeleted, allowedTypeIds],
    enabled: !!orgId,
    queryFn: async (): Promise<DocumentRow[]> => {
      if (allowedTypeIds && allowedTypeIds.length === 0) return [];

      const buildQuery = () => {
        let q = supabase
          .from("documents")
          .select("*")
          .eq("org_id", orgId!)
          .order("created_at", { ascending: false });

        if (!includeDeleted) q = q.is("deleted_at", null);
        if (status !== "all") q = q.eq("status", status);
        if (typeId !== "all") q = q.eq("document_type_id", typeId);
        if (allowedTypeIds && allowedTypeIds.length > 0) {
          q = q.in("document_type_id", allowedTypeIds);
        }
        if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
        return q;
      };

      // Paginação por offset/range para evitar problemas de empates em created_at
      // (cursor .lt(created_at) descartava linhas com timestamp igual e podia parar
      // prematuramente antes de trazer todos os documentos do tipo).
      const PAGE = 1000;
      const all: DocumentRow[] = [];
      let from = 0;
      // Safety net para evitar loop infinito em caso de bug do backend
      const HARD_MAX = 1_000_000;
      while (from < HARD_MAX) {
        const { data, error } = await buildQuery().range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data ?? [];
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`documents:${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `org_id=eq.${orgId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["documents"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  return query;
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: ["document", id],
    enabled: !!id,
    queryFn: async (): Promise<DocumentRow | null> => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
