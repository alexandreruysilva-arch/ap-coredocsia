import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollText, ShieldCheck, FileCheck2, Info, CheckCircle2, ListChecks, ExternalLink } from "lucide-react";

export const Route = createFileRoute('/_authenticated/decreto-10278')({
  component: Decreto10278Page,
});

function Decreto10278Page() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none border-b bg-card/50 backdrop-blur-sm p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight">Implementação de Fluxo para Conformidade com o Decreto nº 10.278/2020</h1>
              <p className="text-sm text-muted-foreground">
                Diretrizes e requisitos para digitalização de documentos públicos.
              </p>
            </div>
          </div>
          <a 
            href="https://www.gov.br/conarq/pt-br/legislacao-arquivistica/decretos-federais/decreto-no-10-278-de-18-de-marco-de-2020" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs font-medium text-primary hover:underline"
          >
            Ver Legislação <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
          
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Objetivo
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Desenvolver um fluxo de trabalho que garanta a conformidade com os requisitos do Decreto nº 10.278, de 18 de março de 2020, após a indexação de imagens. O fluxo deve ser construído com base nas diretrizes estabelecidas no decreto, que regulamenta a digitalização de documentos públicos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-primary" />
                  Requisitos Técnicos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">1. Análise do Decreto</h4>
                  <p className="text-xs text-muted-foreground">Detalhamento dos artigos e incisos relevantes que impactam o processo de indexação.</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">2. Mapeamento do Fluxo</h4>
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                    <li>Etapas desde o recebimento até a disponibilização final.</li>
                    <li>Pontos de controle de qualidade e validação.</li>
                    <li>Especificação de metadados obrigatórios para indexação.</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">3. Indexação de Imagens</h4>
                  <p className="text-xs text-muted-foreground">Garantia de padrões de metadados, integridade e autenticidade das imagens digitalizadas.</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">4. Armazenamento e Acesso</h4>
                  <p className="text-xs text-muted-foreground">Preservação a longo prazo e mecanismos de busca e recuperação eficientes.</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">5. Segurança e Integridade</h4>
                  <p className="text-xs text-muted-foreground">Proteção contra acesso não autorizado e rastreabilidade total das operações.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  Passos Necessários
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    "Análise aprofundada do Decreto nº 10.278/2020.",
                    "Elaboração de fluxograma detalhado do processo.",
                    "Definição dos padrões de metadados alinhados com o decreto.",
                    "Especificação técnica da ferramenta de fluxo.",
                    "Desenvolvimento de Procedimentos Operacionais Padrão (POPs).",
                    "Implementação e teste de conformidade do fluxo.",
                    "Treinamento para os usuários envolvidos.",
                    "Plano de monitoramento e auditoria contínua."
                  ].map((step, index) => (
                    <div key={index} className="flex gap-3 p-2 rounded-md bg-background/50 border border-border/50">
                      <span className="text-xs font-bold text-primary shrink-0 w-4">{index + 1}.</span>
                      <p className="text-xs text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center space-x-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Integridade</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Garantia de que o documento digitalizado mantém a fidedignidade em relação ao original.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center space-x-2">
                <FileCheck2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Autenticidade</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Uso de assinatura digital ICP-Brasil para conferir validade jurídica ao acervo digital.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center space-x-2">
                <ScrollText className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Preservação</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Requisitos mínimos de qualidade e metadados para armazenamento de longo prazo.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
