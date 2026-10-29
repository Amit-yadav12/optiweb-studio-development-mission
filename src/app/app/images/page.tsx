import { ScanSearch } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Layout";
import { ImageOptimizer } from "@/features/images/ImageOptimizer";
import { limits } from "@/server/config/env";

export const metadata = { title: "Image Optimizer" };

export default function ImageOptimizerPage() {
  return (
    <WorkspaceShell
      title="Image Optimizer"
      context="Convert, compress and compare — measured from real output"
      actions={
        <ButtonLink href="/app/assets" variant="ghost" size="sm" leading={<ScanSearch className="size-3.5" aria-hidden />}>
          Analyzer
        </ButtonLink>
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          eyebrow="Tool"
          title="Image Optimizer"
          description="Reduce image weight while preserving the visual quality you need."
          actions={
            <ButtonLink href="/app/history" variant="secondary" size="sm">
              Past results
            </ButtonLink>
          }
        />
        <ImageOptimizer
          limits={{
            maxFileMb: Math.round(limits.maxFileBytes / (1024 * 1024)),
            maxFiles: limits.maxFilesPerRequest,
            maxDecodedPixels: limits.maxDecodedPixels,
          }}
        />
      </div>
    </WorkspaceShell>
  );
}
