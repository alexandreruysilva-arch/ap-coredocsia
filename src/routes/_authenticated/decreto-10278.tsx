import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Scale,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  RotateCcw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/decreto-10278")({
  component: Decreto10278Page,
});

/** Estados possíveis de cada item do checklist. */
type ItemStatus = "pendente" | "conforme" | "nao_aplicavel";

interface ChecklistItem {
  readonly id: string;
  readonly artigo: string;
  readonly titulo: string;
  readonly descricao: string;
  /** Itens obrigatórios não podem ser marcados como "não aplicável". */
  readonly obrigatorio: boolean;
}

/** Requisitos técnicos do Decreto nº 10.278/2020 (Anexos I e II) e da Lei 12.682/2012. */
const CHECKLIST: readonly ChecklistItem[] = [
  {
    id: "integridade",
    artigo: "Art. 3º, I",
    titulo: "Integridade e confiabilidade do documento",
    descricao:
      "O processo de digitalização deve assegurar que o documento digitalizado seja fiel ao original, sem alterações de conteúdo.",
    obrigatorio: true,
  },
  {
    id: "rastreabilidade",
    artigo: "Art. 3º, II",
    titulo: "Rastreabilidade e auditabilidade",
    descricao:
      "Registro em trilha de auditoria de todas as etapas: captura, indexação, validação e armazenamento.",
    obrigatorio: true,
  },
  {
    id: "confidencialidade",
    artigo: "Art. 3º, IV",
    titulo: "Confidencialidade e controle de acesso",
    descricao:
      "Acesso restrito por perfil/organização, com políticas de segurança aplicadas ao repositório.",
    obrigatorio: true,
  },
  {
    id: "assinatura",
    artigo: "Art. 5º",
    titulo: "Assinatura digital ICP-Brasil",
    descricao:
      "Documento digitalizado assinado com certificado ICP-Brasil, em padrão CAdES ou PAdES.",
    obrigatorio: true,
  },
  {
    id: "metadados",
    artigo: "Anexo I",
    titulo: "Metadados mínimos obrigatórios",
    descricao:
      "Assunto, data/hora da digitalização, identificação do responsável, título, tipo documental, hash e formato.",
    obrigatorio: true,
  },
  {
    id: "resolucao",
    artigo: "Anexo II",
    titulo: "Resolução mínima de captura",
    descricao:
      "300 dpi para textos monocromáticos e coloridos; 300 dpi em RGB para fotografias e documentos com fundo complexo.",
    obrigatorio: true,
  },
  {
    id: "formato",
    artigo: "Anexo II",
    titulo: "Formato de arquivo adequado",
    descricao:
      "PDF/A preferencialmente, ou PNG/JPEG para imagens, preservando legibilidade e cores do original.",
    obrigatorio: true,
  },
  {
    id: "hash",
    artigo: "Art. 3º, I",
    titulo: "Registro de hash criptográfico",
    descricao:
      "Cálculo e armazenamento de hash (SHA-256) do arquivo para comprovação futura de integridade.",
    obrigatorio: true,
  },
  {
    id: "preservacao",
    artigo: "Art. 6º",
    titulo: "Preservação e retenção",
    descricao:
      "Documento mantido em repositório confiável durante todo o prazo de guarda previsto na tabela de temporalidade.",
    obrigatorio: true,
  },
  {
    id: "descarte",
    artigo: "Art. 7º",
    titulo: "Descarte do original em papel",
    descricao:
      "Eliminação do original somente após conferência e conforme regras aplicáveis ao tipo documental.",
    obrigatorio: false,
  },
  {
    id: "pessoal",
    artigo: "Art. 4º",
    titulo: "Documentos pessoais",
    descricao:
      "Documentos pessoais digitalizados por pessoa natural seguem requisitos próprios de equiparação ao original.",
    obrigatorio: false,
  },
];

const STORAGE_KEY = "decreto-10278-checklist";

const STATUS_META: Record<
  ItemStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  conforme: {
    label: "Conforme",
    icon: CheckCircle2,
    className: "border-success/40 bg-success/10 text-success",
  },
  pendente: {
    label: "Pendente",
    icon: AlertTriangle,
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  nao_aplicavel: {
    label: "Não aplicável",
    icon: MinusCircle,
    className: "border-border bg-muted text-muted-foreground",
  },
};

type StatusMap = Record<string, ItemStatus>;

function initialState(): StatusMap {
  return Object.fromEntries(CHECKLIST.map((i) => [i.id, "pendente" as ItemStatus]));
}

/** Lê o estado persistido com validação defensiva — dados locais não são confiáveis. */
function readStored(): StatusMap {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return initialState();
    const base = initialState();
    for (const item of CHECKLIST) {
      const value = (parsed as Record<string, unknown>)[item.id];
      if (value === "conforme" || value === "pendente" || value === "nao_aplicavel") {
        // Itens obrigatórios nunca podem ficar como "não aplicável".
        base[item.id] = value === "nao_aplicavel" && item.obrigatorio ? "pendente" : value;
      }
    }
    return base;
  } catch {
    return initialState();
  }
}

function Decreto10278Page() {
  const [status, setStatus] = useState<StatusMap>(initialState);
  const [hydrated, setHydrated] = useState(false);

  // localStorage só existe no cliente — ler após a hidratação evita mismatch de SSR.
  useEffect(() => {
    setStatus(readStored());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
    } catch {
      // Armazenamento indisponível (modo privado / cota) — o checklist segue funcional em memória.
    }
  }, [status, hydrated]);

  const resumo = useMemo(() => {
    const aplicaveis = CHECKLIST.filter((i) => status[i.id] !== "nao_aplicavel");
    const conformes = aplicaveis.filter((i) => status[i.id] === "conforme").length;
    const pendentesObrigatorios = CHECKLIST.filter(
      (i) => i.obrigatorio && status[i.id] !== "conforme",
    ).length;
    const percentual =
      aplicaveis.length === 0 ? 0 : Math.round((conformes / aplicaveis.length) * 100);
    return {
      total: CHECKLIST.length,
      aplicaveis: aplicaveis.length,
      conformes,
      pendentes: aplicaveis.length - conformes,
      naoAplicaveis: CHECKLIST.length - aplicaveis.length,
      pendentesObrigatorios,
      percentual,
      conformeGeral: pendentesObrigatorios === 0,
    };
  }, [status]);

  function setItem(id: string, value: ItemStatus) {
    setStatus((prev) => ({ ...prev, [id]: value }));
  }

  function reset() {
    setStatus(initialState());
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
            <Sparkles className="h-3.5 w-3.5 text-blue-800" />
            Conformidade legal
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
            Decreto 10.278/2020
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Checklist dos requisitos técnicos para que documentos digitalizados produzam os
            mesmos efeitos legais dos originais, conforme o Decreto nº 10.278/2020 e a
            Lei nº 12.682/2012.
          </p>
        </div>
      </header>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Conformidade geral</p>
          <p className="text-2xl font-display font-bold mt-1">{resumo.percentual}%</p>
          <Progress value={resumo.percentual} className="h-1.5 mt-2" />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Itens conformes</p>
          <p className="text-2xl font-display font-bold mt-1 text-success">
            {resumo.conformes}
            <span className="text-sm text-muted-foreground font-normal">
              /{resumo.aplicaveis}
            </span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Pendências obrigatórias</p>
          <p
            className={cn(
              "text-2xl font-display font-bold mt-1",
              resumo.pendentesObrigatorios > 0 ? "text-destructive" : "text-success",
            )}
          >
            {resumo.pendentesObrigatorios}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Situação</p>
          <div className="mt-2">
            {resumo.conformeGeral ? (
              <Badge className="bg-success/15 text-success border-success/40 hover:bg-success/15">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Apto ao descarte legal
              </Badge>
            ) : (
              <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Requisitos pendentes
              </Badge>
            )}
          </div>
        </Card>
      </div>

      <Card className="divide-y divide-border">
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium flex items-center gap-2">
              <Scale className="h-4 w-4 text-blue-800" />
              Checklist de conformidade
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {resumo.total} requisitos · {resumo.naoAplicaveis} marcados como não aplicáveis
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-2" /> Reiniciar
          </Button>
        </div>

        {CHECKLIST.map((item) => {
          const current = status[item.id] ?? "pendente";
          const meta = STATUS_META[current];
          const StatusIcon = meta.icon;

          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {item.artigo}
                  </Badge>
                  <span className="font-medium text-sm">{item.titulo}</span>
                  {item.obrigatorio && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Obrigatório
                    </span>
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                      meta.className,
                    )}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {meta.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
                  {item.descricao}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={current === "conforme" ? "default" : "outline"}
                  onClick={() => setItem(item.id, "conforme")}
                >
                  Conforme
                </Button>
                <Button
                  size="sm"
                  variant={current === "pendente" ? "default" : "outline"}
                  onClick={() => setItem(item.id, "pendente")}
                >
                  Pendente
                </Button>
                {!item.obrigatorio && (
                  <Button
                    size="sm"
                    variant={current === "nao_aplicavel" ? "default" : "outline"}
                    onClick={() => setItem(item.id, "nao_aplicavel")}
                  >
                    N/A
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
