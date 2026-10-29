import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { PageHeader } from "@/components/ui/Layout";
import { FontOptimizer } from "@/features/fonts/FontOptimizer";
import { getPreferences } from "@/server/services/storageService";
import { readGuestSession } from "@/lib/session-server";
import type { FontDisplayPolicy } from "@/types/domain";

export const metadata = { title: "Font Optimizer" };
export const dynamic = "force-dynamic";

export default async function FontOptimizerPage() {
  const { sessionId } = await readGuestSession();
  const prefs = sessionId ? await getPreferences(sessionId) : null;

  return (
    <WorkspaceShell title="Font Optimizer" context="PostCSS analysis and safe font-display patching">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHeader
          eyebrow="Tool"
          title="Font Optimizer"
          description="Find @font-face rules that never declare font-display, review the exact diff, and download the patched stylesheet."
        />
        <FontOptimizer initialPolicy={(prefs?.fontDisplayPolicy ?? "swap") as FontDisplayPolicy} />
      </div>
    </WorkspaceShell>
  );
}
