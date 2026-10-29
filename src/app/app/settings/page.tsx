import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { PageHeader } from "@/components/ui/Layout";
import { SettingsForm } from "@/features/settings/SettingsForm";
import { getPreferences } from "@/server/services/storageService";
import { readGuestSession } from "@/lib/session-server";
import type { Preferences } from "@/types/domain";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const BUILT_INS: Preferences = {
  defaultImageFormat: "webp",
  defaultQuality: 78,
  defaultMaxWidth: null,
  fontDisplayPolicy: "swap",
  analyzerThresholdKb: 300,
  reduceMotion: false,
  updatedAt: null,
};

export default async function SettingsPage() {
  const { sessionId, shortCode } = await readGuestSession();
  const stored = sessionId ? await getPreferences(sessionId) : null;

  return (
    <WorkspaceShell title="Settings" context={shortCode ? `Guest session ${shortCode}` : "Guest session"}>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          eyebrow="Preferences"
          title="Settings"
          description="Defaults for the optimizer and analyzer, plus the limits this deployment enforces."
        />
        <SettingsForm defaults={stored ?? BUILT_INS} />
      </div>
    </WorkspaceShell>
  );
}
