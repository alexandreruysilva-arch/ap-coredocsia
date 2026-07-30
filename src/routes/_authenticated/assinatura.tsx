import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";
import {
  BadgeCheck,
  FileSignature,
  Loader2,
  Lock,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Upload as UploadIcon,
  Download,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  loadPkcs12,
  signFileDetached,
  verifyDetachedSignature,
  SignatureError,
  type LoadedCertificate,
  type VerificationResult,
} from "@/lib/pkcs7-sign";
import { signFileAsPdf } from "@/lib/pdf-sign";

export const Route = createFileRoute("/_authenticated/assinatura")({
  component: SignaturePage,
  head: () => ({
    meta: [
      { title: "Assinatura digital de imagens | Plataforma IA" },
      {
        name: "description",
        content:
          "Assine imagens digitalmente com certificado A1 (.pfx/.p12) no próprio navegador, individualmente ou em lote, gerando arquivos .p7s destacados.",
      },
      { property: "og:title", content: "Assinatura digital de imagens" },
      {
        property: "og:description",
        content:
          "Assinatura PKCS#7 destacada de imagens em lote, com a chave privada processada apenas no navegador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ItemStatus = "pending" | "signing" | "signed" | "error";

/** Formato de saída: assinatura destacada (.p7s) ou PDF com assinatura embutida. */
type OutputFormat = "p7s" | "pdf";

interface SignItem {
  id: string;
  file: File;
  status: ItemStatus;
  error?: string;
  signature?: { fileName: string; blob: Blob; sha256: string };
}

const ACCEPTED_IMAGES = "image/*,.jpg,.jpeg,.png,.tif,.tiff,.webp,.bmp,.pdf";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function SignaturePage() {
  // --- Certificado -------------------------------------------------------
  const [pfxFile, setPfxFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [certificates, setCertificates] = useState<LoadedCertificate[]>([]);
  const [selectedCertIndex, setSelectedCertIndex] = useState<string>("");
  const [unlocking, setUnlocking] = useState(false);

  // --- Fila de assinatura ------------------------------------------------
  const [items, setItems] = useState<SignItem[]>([]);
  const [signing, setSigning] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("pdf");
  const [progress, setProgress] = useState(0);

  // --- Verificação -------------------------------------------------------
  const [verifyOriginal, setVerifyOriginal] = useState<File | null>(null);
  const [verifySig, setVerifySig] = useState<File | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const filesInputRef = useRef<HTMLInputElement>(null);

  const selectedCert = useMemo(
    () => certificates.find((c) => String(c.index) === selectedCertIndex) ?? null,
    [certificates, selectedCertIndex],
  );

  const signedCount = items.filter((i) => i.status === "signed").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const canSign = Boolean(selectedCert) && items.length > 0 && !signing;

  const handleUnlock = useCallback(async () => {
    if (!pfxFile) {
      toast.error("Selecione o arquivo do certificado (.pfx ou .p12).");
      return;
    }
    setUnlocking(true);
    try {
      const loaded = await loadPkcs12(pfxFile, password);
      setCertificates(loaded);
      setSelectedCertIndex(String(loaded[0].index));
      // A senha não é mantida em memória após a abertura do PKCS#12.
      setPassword("");
      toast.success(
        loaded.length === 1
          ? `Certificado carregado: ${loaded[0].subjectCN}`
          : `${loaded.length} certificados carregados. Selecione qual usar.`,
      );
    } catch (error) {
      const message =
        error instanceof SignatureError
          ? error.message
          : "Não foi possível abrir o certificado.";
      setCertificates([]);
      setSelectedCertIndex("");
      toast.error(message);
    } finally {
      setUnlocking(false);
    }
  }, [pfxFile, password]);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: SignItem[] = Array.from(fileList).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      status: "pending",
    }));
    setItems((prev) => [...prev, ...next]);
  }, []);

  const handleSignAll = useCallback(async () => {
    if (!selectedCert) return;
    setSigning(true);
    setProgress(0);

    const pending = items.filter((i) => i.status !== "signed");
    let done = 0;

    for (const item of pending) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "signing", error: undefined } : i)),
      );
      try {
        const signature =
          outputFormat === "pdf"
            ? await signFileAsPdf(item.file, selectedCert)
            : await signFileDetached(item.file, selectedCert);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "signed", signature } : i)),
        );
      } catch (error) {
        const message =
          error instanceof SignatureError ? error.message : "Falha desconhecida ao assinar.";
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "error", error: message } : i)),
        );
      }
      done += 1;
      setProgress(Math.round((done / pending.length) * 100));
      // Cede o event loop para manter a UI responsiva em lotes grandes.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    setSigning(false);
    toast.success(`Assinatura concluída (${pending.length} arquivo(s) processado(s)).`);
  }, [items, selectedCert, outputFormat]);

  /** Baixa cada arquivo assinado individualmente, sem compactação. */
  const handleDownloadEach = useCallback(async () => {
    const signed = items.filter((i) => i.status === "signed" && i.signature);
    if (signed.length === 0) return;
    for (const item of signed) {
      const sig = item.signature!;
      const typed =
        sig.blob.type
          ? sig.blob
          : new Blob([sig.blob], {
              type: outputFormat === "pdf" ? "application/pdf" : "application/pkcs7-signature",
            });
      downloadBlob(typed, sig.fileName);
      // Pequeno intervalo evita que o navegador bloqueie downloads em sequência.
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    toast.success(`${signed.length} arquivo(s) baixado(s) individualmente.`);
  }, [items, outputFormat]);

  const handleDownloadZip = useCallback(async () => {
    const signed = items.filter((i) => i.status === "signed" && i.signature);
    if (signed.length === 0) return;
    const zip = new JSZip();
    for (const item of signed) {
      zip.file(item.signature!.fileName, item.signature!.blob);
    }
    zip.file(
      "MANIFESTO.txt",
      signed
        .map((i) => `${i.file.name}\tSHA-256: ${i.signature!.sha256}`)
        .join("\n"),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(
      blob,
      `${outputFormat === "pdf" ? "pdfs-assinados" : "assinaturas"}-${new Date().toISOString().slice(0, 10)}.zip`,
    );
  }, [items, outputFormat]);

  const handleVerify = useCallback(async () => {
    if (!verifyOriginal || !verifySig) {
      toast.error("Selecione a imagem original e o arquivo .p7s.");
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      setVerifyResult(await verifyDetachedSignature(verifyOriginal, verifySig));
    } catch (error) {
      toast.error(
        error instanceof SignatureError ? error.message : "Falha ao verificar a assinatura.",
      );
    } finally {
      setVerifying(false);
    }
  }, [verifyOriginal, verifySig]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
            <Sparkles className="h-3.5 w-3.5 text-blue-800" />
            Certificado A1 · PKCS#7 destacado
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
            Assinatura digital de imagens
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Assine imagens individualmente ou em lote com seu certificado .pfx/.p12. Todo o
            processo ocorre no seu navegador — a chave privada e a senha nunca saem desta máquina.
          </p>
        </div>
      </header>

      {/* 1. Certificado */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-blue-800" />
          <h2 className="font-semibold">1. Certificado digital</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="pfx">Arquivo (.pfx / .p12)</Label>
            <Input
              id="pfx"
              type="file"
              accept=".pfx,.p12"
              onChange={(event) => {
                setPfxFile(event.target.files?.[0] ?? null);
                setCertificates([]);
                setSelectedCertIndex("");
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pfx-pass">Senha do certificado</Label>
            <Input
              id="pfx-pass"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleUnlock();
              }}
              placeholder="••••••••"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void handleUnlock()} disabled={unlocking || !pfxFile}>
              {unlocking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Abrir certificado
            </Button>
          </div>
        </div>

        {certificates.length > 0 && (
          <div className="space-y-3">
            <Separator />
            {certificates.length > 1 && (
              <div className="space-y-1.5 max-w-md">
                <Label>Certificado a utilizar</Label>
                <Select value={selectedCertIndex} onValueChange={setSelectedCertIndex}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {certificates.map((cert) => (
                      <SelectItem key={cert.index} value={String(cert.index)}>
                        {cert.subjectCN}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedCert && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-blue-800" />
                  <span className="font-medium">{selectedCert.subjectCN}</span>
                  {selectedCert.expired ? (
                    <Badge variant="destructive">Expirado</Badge>
                  ) : (
                    <Badge variant="secondary">Válido</Badge>
                  )}
                </div>
                <p className="text-muted-foreground">Emissor: {selectedCert.issuerCN}</p>
                <p className="text-muted-foreground">
                  Validade: {selectedCert.validFrom.toLocaleDateString("pt-BR")} até{" "}
                  {selectedCert.validTo.toLocaleDateString("pt-BR")}
                </p>
                <p className="text-muted-foreground break-all">
                  Série: {selectedCert.serialNumber}
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 2. Imagens */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-blue-800" />
            <h2 className="font-semibold">2. Documentos/Imagens para assinar</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={filesInputRef}
              type="file"
              multiple
              accept={ACCEPTED_IMAGES}
              className="hidden"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Saída</Label>
              <Select
                value={outputFormat}
                onValueChange={(value) => {
                  setOutputFormat(value as OutputFormat);
                  // Assinaturas já geradas pertencem ao formato anterior.
                  setItems((prev) =>
                    prev.map((i) => ({ ...i, status: "pending", signature: undefined, error: undefined })),
                  );
                  setProgress(0);
                }}
                disabled={signing}
              >
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF assinado (.pdf)</SelectItem>
                  <SelectItem value="p7s">Assinatura destacada (.p7s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => filesInputRef.current?.click()}>
              <UploadIcon className="h-4 w-4" />
              Selecionar imagens
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setItems([]);
                setProgress(0);
              }}
              disabled={items.length === 0 || signing}
            >
              <Trash2 className="h-4 w-4" />
              Limpar
            </Button>
            <Button onClick={() => void handleSignAll()} disabled={!canSign}>
              {signing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {items.length > 1 ? `Assinar ${items.length} arquivos` : "Assinar"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleDownloadEach()}
              disabled={signedCount === 0}
            >
              <Download className="h-4 w-4" />
              Baixar {outputFormat === "pdf" ? "PDFs" : "arquivos"} ({signedCount})
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleDownloadZip()}
              disabled={signedCount === 0}
            >
              <Download className="h-4 w-4" />
              Baixar .zip
            </Button>
          </div>
        </div>

        {signing && <Progress value={progress} className="h-1" />}

        {items.length === 0 ? (
          <div
            className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addFiles(event.dataTransfer.files);
            }}
          >
            Arraste imagens aqui ou use “Selecionar imagens”.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {items.length} arquivo(s) · {signedCount} assinado(s)
              {errorCount > 0 ? ` · ${errorCount} com erro` : ""}
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 p-3 text-sm",
                    item.status === "signing" && "bg-blue-500/5",
                    item.status === "error" && "bg-destructive/5",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(item.file.size)}
                      {item.error ? ` · ${item.error}` : ""}
                      {item.signature ? ` · SHA-256 ${item.signature.sha256.slice(0, 16)}…` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === "signing" && (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-800" />
                    )}
                    {item.status === "signed" && <Badge variant="secondary">Assinado</Badge>}
                    {item.status === "error" && <Badge variant="destructive">Erro</Badge>}
                    {item.signature && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const sig = item.signature!;
                          const typed = sig.blob.type
                            ? sig.blob
                            : new Blob([sig.blob], {
                                type:
                                  outputFormat === "pdf"
                                    ? "application/pdf"
                                    : "application/pkcs7-signature",
                              });
                          downloadBlob(typed, sig.fileName);
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Baixar {outputFormat === "pdf" ? "PDF" : ".p7s"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={signing}
                      onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* 3. Verificação */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-blue-800" />
          <h2 className="font-semibold">3. Verificar uma assinatura</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="verify-original">Imagem original</Label>
            <Input
              id="verify-original"
              type="file"
              accept={ACCEPTED_IMAGES}
              onChange={(event) => setVerifyOriginal(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="verify-sig">Assinatura (.p7s)</Label>
            <Input
              id="verify-sig"
              type="file"
              accept=".p7s"
              onChange={(event) => setVerifySig(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => void handleVerify()}
              disabled={verifying || !verifyOriginal || !verifySig}
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BadgeCheck className="h-4 w-4" />
              )}
              Verificar
            </Button>
          </div>
        </div>

        {verifyResult && (
          <div
            className={cn(
              "rounded-lg border p-3 text-sm space-y-1",
              verifyResult.valid
                ? "border-border bg-muted/40"
                : "border-destructive/40 bg-destructive/5",
            )}
          >
            <p className="font-medium">
              {verifyResult.valid
                ? "Assinatura íntegra: o arquivo corresponde ao conteúdo assinado."
                : (verifyResult.reason ?? "Assinatura inválida.")}
            </p>
            <p className="text-muted-foreground">Signatário: {verifyResult.signerCN}</p>
            <p className="text-muted-foreground">Emissor: {verifyResult.issuerCN}</p>
            {verifyResult.signedAt && (
              <p className="text-muted-foreground">
                Data da assinatura: {verifyResult.signedAt.toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
