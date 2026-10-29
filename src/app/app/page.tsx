import { ArrowRight, Clock, FileCode2, ImageDown, Plus, Ruler } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, StatusBadge } from "@/components/ui/Feedback";
import { statusToneFor } from "@/lib/status";
import { Panel, PanelHeader, StatStrip, TableShell, Td, Th, InlineNote } from "@/components/ui/Layout";
import { listHistory, sessionSummary } from "@/server/services/storageService";
import { readGuestSession, sessionLabel } from "@/lib/session-server";
import { formatBytes, formatNumber, formatRelativeTime, formatSavingsPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  "image.optimize": "Images",
  "css.font-display": "CSS",
  "asset.analyze": "Analysis",
  "site.audit": "Audit",
};

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { sessionId, shortCode } = await readGuestSession();
  let summary = { jobs: 0, savedBytes: 0, inputBytes: 0, files: 0, completed: 0 };
  let history: {
    entries: Awaited<ReturnType<typeof listHistory>>["entries"];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  } = { entries: [], total: 0, page: 1, pageSize: 6, pageCount: 1 };
  let storageDown = false;
  if (sessionId) {
    try {
      [summary, history] = await Promise.all([
        sessionSummary(sessionId),
        listHistory(sessionId, { kind: "all", status: "all", sort: "newest", page: 1, pageSize: 6 }),
      ]);
    } catch {
      // The tools still work without persistence; only recording degrades.
      storageDown = true;
    }
  }

  const savingsPercent = summary.inputBytes > 0 ? (summary.savedBytes / summary.inputBytes) * 100 : null;

  return (
    <WorkspaceShell
      title="Overview"
      context={sessionLabel(shortCode)}
      actions={
        <ButtonLink href="/app/images" variant="primary" size="sm" leading={<Plus className="size-3.5" aria-hidden />}>
          New job
        </ButtonLink>
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Next action */}
        <section className="border border-line bg-surface">
          <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="font-mono text-2xs tracking-[0.14em] text-muted uppercase">Workspace</p>
              <h1 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-ink">
                Start with the asset you already ship.
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Upload an image to measure a real conversion, or paste a stylesheet to find
                <span className="font-mono text-xs"> @font-face</span> rules that never declare
                <span className="font-mono text-xs"> font-display</span>. Everything below is measured from
                the bytes your files actually produce.
              </p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto">
              <ButtonLink
                href="/app/images"
                variant="primary"
                size="lg"
                className="justify-between"
                leading={<ImageDown className="size-4" aria-hidden />}
                trailing={<ArrowRight className="size-4" aria-hidden />}
              >
                Optimize images
              </ButtonLink>
              <ButtonLink
                href="/app/fonts"
                variant="secondary"
                size="lg"
                className="justify-between"
                leading={<FileCode2 className="size-4" aria-hidden />}
                trailing={<ArrowRight className="size-4" aria-hidden />}
              >
                Analyze font CSS
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Session summary */}
        <section aria-labelledby="session-summary">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="session-summary" className="text-sm font-semibold text-ink">
              Session activity
            </h2>
            <span className="text-2xs text-muted">Scoped to this browser session · artifacts expire after 24 h</span>
          </div>
          <StatStrip
            items={[
              { label: "Jobs run", value: formatNumber(summary.jobs), hint: `${formatNumber(summary.files)} files handled` },
              { label: "Bytes saved", value: formatBytes(summary.savedBytes), hint: savingsPercent !== null ? formatSavingsPercent(savingsPercent) : "no conversions yet" },
              { label: "Successful", value: formatNumber(summary.completed), hint: `${formatNumber(summary.jobs - summary.completed)} with issues` },
              { label: "Input weight", value: formatBytes(summary.inputBytes), hint: "total uploaded" },
            ]}
          />
          {summary.jobs === 0 ? (
            <div className="mt-3 border border-line border-t-0">
              <EmptyState
                title="No jobs in this session yet"
                description="Run an image conversion or a CSS analysis and the results will appear here with their measured input and output sizes."
                action={
                  <ButtonLink href="/app/images" variant="primary" size="sm">
                    Optimize your first image
                  </ButtonLink>
                }
              />
            </div>
          ) : null}
        </section>

        {/* Recent activity */}
        <section aria-labelledby="recent-activity">
          <Panel padded={false}>
            <div className="px-4 pt-4 sm:px-5">
              <PanelHeader
                id="recent-activity"
                title="Recent activity"
                description="The six most recent jobs for this session."
                actions={
                  <ButtonLink href="/app/history" variant="ghost" size="sm" trailing={<ArrowRight className="size-3.5" aria-hidden />}>
                    All history
                  </ButtonLink>
                }
              />
            </div>
            {history.entries.length === 0 ? (
              <EmptyState
                icon={<Clock className="size-4" aria-hidden />}
                title="Nothing recorded yet"
                description="History rows are written when a job completes, so you can reopen a result without re-uploading the source."
              />
            ) : (
              <>
                <TableShell minWidth={640}>
                  <thead>
                    <tr>
                      <Th>Job</Th>
                      <Th>Type</Th>
                      <Th>Status</Th>
                      <Th numeric>Saved</Th>
                      <Th numeric>When</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.entries.map((entry) => (
                      <tr key={entry.id} className="transition-colors duration-150 hover:bg-surface-sunken/60">
                        <Td>
                          <span className="block max-w-[16rem] truncate text-ink">{entry.label}</span>
                          {entry.note ? <span className="block font-mono text-2xs text-muted">{entry.note}</span> : null}
                        </Td>
                        <Td>
                          <span className="font-mono text-xs text-ink-soft">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
                        </Td>
                        <Td>
                          <StatusBadge tone={statusToneFor(entry.status)}>{entry.status}</StatusBadge>
                        </Td>
                        <Td numeric>
                          {entry.savedBytes === 0 ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className="text-ok">
                              {formatBytes(entry.savedBytes)}{" "}
                              <span className="text-muted">{formatSavingsPercent(entry.savingsPercent)}</span>
                            </span>
                          )}
                        </Td>
                        <Td numeric>
                          <span className="text-ink-soft">{formatRelativeTime(entry.createdAt)}</span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
                <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
                  <InlineNote>
                    Bytes saved = input bytes − output bytes, summed over the files that converted successfully.
                  </InlineNote>
                  <ButtonLink href="/app/history" variant="secondary" size="sm" trailing={<ArrowRight className="size-3.5" aria-hidden />}>
                    Open
                  </ButtonLink>
                </div>
              </>
            )}
          </Panel>
        </section>

        {/* How metrics are produced */}
        <Panel as="aside" aria-label="Measurement method">
          <div className="flex gap-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-sunken text-accent">
              <Ruler className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">How these numbers are produced</h2>
              <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted">
                Savings in bytes = input bytes − output bytes. Savings percentage = (input − output) ÷ input × 100,
                computed per file and aggregated for a job. Sizes are read from the buffers sharp returns, so a
                file that grows after conversion is reported as a negative saving. OptiWeb does not measure Core
                Web Vitals: faster assets are a necessary condition for a faster page, not a guarantee of a
                better score.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </WorkspaceShell>
  );
}
