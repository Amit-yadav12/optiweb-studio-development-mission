import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { PageHeader } from "@/components/ui/Layout";
import { AssetAnalyzer } from "@/features/assets/AssetAnalyzer";
import { getPreferences } from "@/server/services/storageService";
import { readGuestSession } from "@/lib/session-server";
import { limits } from "@/server/config/env";

export const metadata = { title: "Asset Analyzer" };
export const dynamic = "force-dynamic";

export default async function AssetAnalyzerPage() {
  const { sessionId } = await readGuestSession();
  const prefs = sessionId ? await getPreferences(sessionId) : null;

  return (
    <WorkspaceShell title="Asset Analyzer" context="Evidence-based diagnostics for the files you upload">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          eyebrow="Diagnostic"
          title="Asset Analyzer"
          description="Inspect image weight, intrinsic dimensions and CSS font-loading gaps before you spend time converting anything."
        />
        <AssetAnalyzer
          defaults={{
            thresholdKb: prefs?.analyzerThresholdKb ?? 300,
            maxFileMb: Math.round(limits.maxFileBytes / (1024 * 1024)),
            maxFiles: limits.maxFilesPerRequest,
          }}
        />
      </div>
    </WorkspaceShell>
  );
}
