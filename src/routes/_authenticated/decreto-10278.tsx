import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollText, ShieldCheck, FileCheck2, Info } from "lucide-react";

export const Route = createFileRoute('/_authenticated/decreto-10278')({
  component: Decreto10278Page,
});

function Decreto10278Page() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold tracking-tight">Decreto nº 10.278/2020</h1>
        <p className="text-muted-foreground">
          Regulamentação da digitalização de documentos públicos e privados.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center space-x-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Integridade</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Garantia de que o documento digitalizado mantém a fidedignidade em relação ao original.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-x-2">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Autenticidade</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Uso de assinatura digital ICP-Brasil para conferir validade jurídica ao acervo digital.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-x-2">
            <ScrollText className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Preservação</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Requisitos mínimos de qualidade e metadados para armazenamento de longo prazo.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-primary/5">
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
          <ul className="list-disc pl-6 space-y-2 text-sm">
            <li><strong>Assinatura Digital:</strong> Integração com certificados ICP-Brasil para assinatura em lote.</li>
            <li><strong>Metadados:</strong> Extração automática de dados via IA para indexação documental obrigatória.</li>
            <li><strong>Resolução:</strong> Suporte a processamento de imagens em alta resolução conforme exigido.</li>
            <li><strong>Padrões Abertos:</strong> Geração de PDFs assinados seguindo normas técnicas de interoperabilidade.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
