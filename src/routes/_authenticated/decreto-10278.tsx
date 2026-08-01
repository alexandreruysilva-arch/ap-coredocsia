import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollText, ShieldCheck, FileCheck2, Info } from "lucide-react";

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
              <h1 className="text-2xl font-display font-bold tracking-tight">Decreto nº 10.278/2020</h1>
              <p className="text-sm text-muted-foreground">
                Regulamentação da digitalização de documentos públicos e privados.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6 pb-12">
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

          <Card className="border-primary/20 bg-primary/5 overflow-hidden">
            <div className="h-1 bg-primary/20 w-full" />
            <CardHeader>
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                <CardTitle>Conformidade do Sistema</CardTitle>
              </div>
              <CardDescription>
                Como o AP - CoreDocs IA atende aos requisitos do Decreto:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex gap-3 p-3 rounded-lg bg-background/50">
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  <div>
                    <p className="text-sm font-semibold">Assinatura Digital</p>
                    <p className="text-xs text-muted-foreground">Integração com certificados ICP-Brasil para assinatura em lote.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 rounded-lg bg-background/50">
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  <div>
                    <p className="text-sm font-semibold">Metadados</p>
                    <p className="text-xs text-muted-foreground">Extração automática de dados via IA para indexação documental obrigatória.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 rounded-lg bg-background/50">
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  <div>
                    <p className="text-sm font-semibold">Resolução</p>
                    <p className="text-xs text-muted-foreground">Suporte a processamento de imagens em alta resolução conforme exigido.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 rounded-lg bg-background/50">
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  <div>
                    <p className="text-sm font-semibold">Padrões Abertos</p>
                    <p className="text-xs text-muted-foreground">Geração de PDFs assinados seguindo normas técnicas de interoperabilidade.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
